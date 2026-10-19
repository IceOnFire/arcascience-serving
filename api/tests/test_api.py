import json
from pathlib import Path

import httpx   # the embedding client's library: fake upstream responses must be httpx objects
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas import MAX_TEXTS

from .conftest import CMAX, EXACERBATION, PARTICIPANTS


def predict(client, texts, **kwargs):
    return client.post("/predict", json={"texts": texts}, **kwargs)


# --- Predictions ---------------------------------------------------------------------------

def test_predictions_match_the_readme_examples(client):
    response = predict(client, [CMAX, PARTICIPANTS, EXACERBATION])
    assert response.status_code == 200
    body = response.json()
    assert body["model_version"] == "1.0.0"
    cmax, participants, exacerbation = body["predictions"]   # same order as the input

    assert cmax["category"] == "Pharmacokinetic" and cmax["confidence"] > 0.95
    assert not cmax["needs_review"]
    assert participants["category"] == "General Case" and participants["needs_review"]
    assert participants["top"][1]["category"] == "Demographic"
    assert exacerbation["needs_review"]        # a wrong guess, caught by its low confidence


def test_prediction_fields_are_consistent(client):
    for p in predict(client, [CMAX, "some other endpoint", "another one"]).json()["predictions"]:
        probabilities = [t["probability"] for t in p["top"]]
        assert len(p["top"]) == 3
        assert probabilities == sorted(probabilities, reverse=True)
        assert p["category"] == p["top"][0]["category"]
        assert p["confidence"] == probabilities[0]
        assert p["needs_review"] == (p["confidence"] < 0.9)


def test_duplicate_texts_are_embedded_once(client, upstream):
    response = predict(client, [CMAX, PARTICIPANTS, CMAX])
    assert len(response.json()["predictions"]) == 3
    sent = json.loads(upstream.calls.last.request.content)
    assert sent["input"] == [CMAX, PARTICIPANTS]
    assert sent["model"] == "arca-endpoint-embedder" and sent["truncation_dimension"] == 768


def test_upstream_key_is_sent_upstream_only(client, upstream):
    response = predict(client, [CMAX])
    assert upstream.calls.last.request.headers["X-API-Key"] == "upstream-key"
    assert "upstream-key" not in response.text


# --- Authentication and validation ---------------------------------------------------------

@pytest.mark.parametrize("headers", [{}, {"X-API-Key": "wrong"}])
@pytest.mark.parametrize("method, path", [("POST", "/predict"), ("GET", "/model"), ("GET", "/stats")])
def test_protected_endpoints_need_the_key(settings, upstream, headers, method, path):
    with TestClient(create_app(settings), headers=headers) as anonymous:
        response = anonymous.request(method, path, json={"texts": [CMAX]})
    assert response.status_code == 401


@pytest.mark.parametrize("path", ["/health", "/metrics"])
def test_open_endpoints(settings, upstream, path):
    with TestClient(create_app(settings)) as anonymous:
        assert anonymous.get(path).status_code == 200


@pytest.mark.parametrize("texts", [[], ["   "], [""], ["x" * 1001], ["x"] * (MAX_TEXTS + 1)])
def test_invalid_requests(client, upstream, texts):
    assert predict(client, texts).status_code == 422
    assert not upstream.called


def test_missing_configuration_stops_startup(monkeypatch):
    for name in ("API_KEY", "EMBEDDING_URL", "GPU_MODEL_SERVER_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    from pydantic import ValidationError
    from app.config import Settings
    with pytest.raises(ValidationError, match="embedding_url"):
        Settings(_env_file=None)


# --- Upstream failures ---------------------------------------------------------------------

def test_transient_upstream_error_is_retried(client, upstream):
    from .conftest import embedding_response
    upstream.side_effect = [httpx.Response(503), embedding_response]
    assert predict(client, [CMAX]).status_code == 200
    assert upstream.call_count == 2


@pytest.mark.parametrize("failure", [
    httpx.Response(500),
    httpx.ConnectError("connection refused"),
    httpx.Response(200, json={"result": [[0.1, 0.2]]}),     # wrong dimension
    httpx.Response(200, json={"unexpected": True}),
])
def test_upstream_failure_returns_503(client, upstream, failure):
    if isinstance(failure, Exception):
        upstream.side_effect = failure          # raised on every call
    else:
        upstream.side_effect, upstream.return_value = None, failure
    response = predict(client, [CMAX])
    assert response.status_code == 503
    assert response.headers["Retry-After"] == "5"
    assert "embedding_errors_total 1.0" in client.get("/metrics").text


def test_non_retryable_upstream_error_is_not_retried(client, upstream):
    upstream.side_effect = None
    upstream.return_value = httpx.Response(401)
    assert predict(client, [CMAX]).status_code == 503
    assert upstream.call_count == 1


# --- Model, metrics, stats -----------------------------------------------------------------

def test_model_returns_the_manifest(client):
    manifest = client.get("/model").json()
    assert manifest["classifier"]["version"] == "1.0.0"
    assert manifest["embedding"] == {"model": "arca-endpoint-embedder", "dimension": 768, "normalize": True}


def test_metrics_count_predictions(client):
    predict(client, [CMAX, PARTICIPANTS])
    metrics = client.get("/metrics").text
    assert 'predictions_total{category="Pharmacokinetic"} 1.0' in metrics
    assert 'predictions_total{category="General Case"} 1.0' in metrics
    assert "predictions_needs_review_total 1.0" in metrics
    assert 'model_info{embedding_model="arca-endpoint-embedder",version="1.0.0"} 1.0' in metrics


def test_stats_start_empty(client):
    stats = client.get("/stats").json()
    assert stats["window"]["size"] == 0 and stats["drift"] is None


def test_stats_report_drift_once_the_window_is_large_enough(client):
    predict(client, [CMAX] * 99)
    stats = client.get("/stats").json()
    assert stats["window"]["size"] == 99 and stats["drift"] is None
    assert stats["categories"][2] == {"category": "Pharmacokinetic", "share": 1.0, "baseline": 0.1528}

    predict(client, [CMAX])
    drift = client.get("/stats").json()["drift"]
    assert drift["categories"]["status"] == "significant"     # 100% Pharmacokinetic vs 15%


def test_stats_survive_a_restart(settings, upstream):
    with TestClient(create_app(settings), headers={"X-API-Key": "test-key"}) as first:
        predict(first, [CMAX, PARTICIPANTS])
        before = first.get("/stats").json()
    with TestClient(create_app(settings), headers={"X-API-Key": "test-key"}) as second:
        assert second.get("/stats").json() == before
        assert "predictions_total{" not in second.get("/metrics").text   # Prometheus counters do reset


def test_committed_openapi_contract_is_up_to_date(settings):
    """The web apps generate their types from openapi.json: it must match the code."""
    committed = json.loads((Path(__file__).parent.parent / "openapi.json").read_text())
    assert create_app(settings).openapi() == committed, "run scripts/export_openapi.py and commit openapi.json"
