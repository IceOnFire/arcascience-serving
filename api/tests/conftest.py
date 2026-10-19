"""Shared fixtures. The embedding API is mocked with respx: no network, no API key needed.

Texts in fixtures/embeddings.json get their real embeddings (captured once from the API),
so predictions on them are the real ones; any other text gets a deterministic random vector.
"""

import hashlib
import json
from pathlib import Path

import httpx
import numpy as np
import pytest
import respx
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

EMBEDDING_URL = "https://embedding.test/text-embedding"
API_KEY = "test-key"
FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "embeddings.json").read_text())["embeddings"]

CMAX = "Maximum plasma concentration (Cmax)"            # Pharmacokinetic, confident
PARTICIPANTS = "Number of participants"                 # General Case, needs review
EXACERBATION = "Time to first exacerbation"             # wrong guess (Pharmacokinetic), needs review


def fake_embedding(text):
    if text in FIXTURES:
        return FIXTURES[text]
    rng = np.random.default_rng(int(hashlib.sha256(text.encode()).hexdigest()[:8], 16))
    v = rng.normal(size=768)
    return (v / np.linalg.norm(v)).tolist()


def embedding_response(request):
    texts = json.loads(request.content)["input"]
    return httpx.Response(200, json={"result": [fake_embedding(t) for t in texts]})


@pytest.fixture
def settings(tmp_path):
    return Settings(api_key=API_KEY, gpu_model_server_api_key="upstream-key", embedding_url=EMBEDDING_URL,
                    database_path=tmp_path / "predictions.sqlite3", embed_retries=1, _env_file=None)


@pytest.fixture
def upstream():
    """The mocked embedding API. Tests can replace its side effect to simulate failures."""
    with respx.mock(assert_all_called=False) as mock:
        yield mock.post(EMBEDDING_URL).mock(side_effect=embedding_response)


@pytest.fixture
def client(settings, upstream):
    with TestClient(create_app(settings), headers={"X-API-Key": API_KEY}) as c:   # runs the lifespan
        yield c


@pytest.fixture(autouse=True)
def no_backoff(monkeypatch):
    """Retries wait 0.5 s, 1 s, ... in production; not in tests."""
    async def instant(_):
        pass
    monkeypatch.setattr("app.embedder.asyncio.sleep", instant)
