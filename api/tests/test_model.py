"""Loading the model, monitoring, the prediction log, and the packaging script."""

import json
import shutil
import subprocess

import numpy as np
import pytest

from app.classifier import load_model
from app.config import Settings
from app.monitoring import Monitor, drift_status, psi
from app.store import PredictionLog
from scripts import package_model

MODEL_DIR = Settings.model_fields["model_dir"].default


@pytest.fixture
def model_copy(tmp_path):
    shutil.copytree(MODEL_DIR, tmp_path / "model")
    return tmp_path / "model"


def edit_manifest(model_dir, change):
    path = model_dir / "manifest.json"
    manifest = json.loads(path.read_text())
    change(manifest)
    path.write_text(json.dumps(manifest))


# --- Loading -------------------------------------------------------------------------------

def test_model_loads_and_predicts_probabilities():
    model = load_model(MODEL_DIR)
    proba = model.predict_proba(np.random.default_rng(0).normal(size=(5, 768)).astype(np.float32))
    assert proba.shape == (5, 9)
    assert np.allclose(proba.sum(1), 1, atol=1e-5)


def test_weights_not_matching_the_manifest_are_refused(model_copy):
    with open(model_copy / "endpoint_classifier.pt", "ab") as f:
        f.write(b"tampered")
    with pytest.raises(RuntimeError, match="does not match manifest"):
        load_model(model_copy)


def test_categories_not_matching_the_manifest_are_refused(model_copy):
    edit_manifest(model_copy, lambda m: m["classifier"]["classes"].reverse())
    with pytest.raises(RuntimeError, match="categories"):
        load_model(model_copy)


# --- Monitoring ----------------------------------------------------------------------------

def test_psi():
    assert psi([0.5, 0.5], [0.5, 0.5]) == 0
    assert psi([0.5, 0.5], [0.6, 0.4]) == pytest.approx(0.1 * np.log(1.5), rel=1e-6)
    assert psi([0.5, 0.5], [1.0, 0.0]) > 1           # empty bins don't divide by zero


@pytest.mark.parametrize("value, status", [(0, "stable"), (0.099, "stable"), (0.1, "moderate"),
                                           (0.249, "moderate"), (0.25, "significant")])
def test_drift_status(value, status):
    assert drift_status(value) == status


def test_stats_only_compare_the_current_model_version(tmp_path):
    manifest = load_model(MODEL_DIR).manifest
    log = PredictionLog(tmp_path / "log.sqlite3")
    log.insert("0.9.0", ["old"] * 50, ["Cost"] * 50, [0.99] * 50, 0.9)   # an earlier model version
    monitor = Monitor(manifest, log, window_size=100)          # room for the old rows too

    proba = np.zeros((20, 9))
    proba[:, 0] = 0.95
    monitor.record([f"text {i}" for i in range(20)], proba)
    stats = monitor.stats()
    assert stats["window"]["size"] == 20                       # the 50 old rows are left out
    assert stats["categories"][0]["share"] == 1.0              # only v1.0.0's General Case predictions
    assert stats["review_rate"] == 0.0


def test_stats_window_keeps_the_latest_predictions(tmp_path):
    monitor = Monitor(load_model(MODEL_DIR).manifest, PredictionLog(tmp_path / "log.sqlite3"), window_size=10)
    for k in (0, 6):                                           # 20 General Case, then 20 Cost
        proba = np.zeros((20, 9))
        proba[:, k] = 0.95
        monitor.record([f"text {i}" for i in range(20)], proba)
    stats = monitor.stats()
    assert stats["window"]["size"] == 10
    assert stats["categories"][6] == {"category": "Cost", "share": 1.0, "baseline": 0.0395}


def test_baseline_bins_must_end_at_the_review_threshold():
    manifest = json.loads((MODEL_DIR / "manifest.json").read_text())
    manifest["review_threshold"] = 0.8
    with pytest.raises(ValueError, match="threshold"):
        Monitor(manifest, log=None)


# --- Packaging -----------------------------------------------------------------------------

def git(repo, *args):
    subprocess.run(["git", "-C", repo, *args], check=True, capture_output=True)


@pytest.fixture
def training_repo(tmp_path):
    """A minimal training repository: the real weights, a 3-row dataset, its embeddings."""
    repo = tmp_path / "training"
    (repo / "models").mkdir(parents=True)
    (repo / "data").mkdir()
    (repo / "embeddings").mkdir()
    shutil.copy(MODEL_DIR / "endpoint_classifier.pt", repo / "models")
    (repo / "data" / "endpoints_data.csv").write_text("anchor,case\nCmax,Pharmacokinetic\ncmax ,Pharmacokinetic\nAUC,Pharmacokinetic\n")
    np.save(repo / "embeddings" / "anchor.npy", np.random.default_rng(0).normal(size=(3, 768)))
    git(repo, "init", "-q")
    git(repo, "remote", "add", "origin", "https://github.com/example/training.git")
    git(repo, "add", ".")
    git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "train")
    return repo


ARGS = ["--accuracy", "0.7", "--macro-f1", "0.6", "--test-confidence", "0.1,0.2,0.3,0.4"]


def test_packaging_writes_a_manifest_the_server_accepts(training_repo, tmp_path):
    out = tmp_path / "out"
    package_model.main([str(training_repo), "--output", str(out), "--version", "2.0.0", *ARGS])
    model = load_model(out)                                   # hash and categories check out
    manifest = model.manifest
    assert manifest["classifier"]["version"] == "2.0.0"
    assert manifest["classifier"]["source"].startswith("https://github.com/example/training/tree/")
    assert manifest["embedding"]["dimension"] == 768
    assert manifest["baseline"]["confidence"]["shares"] == [0.1, 0.2, 0.3, 0.4]
    shares = manifest["baseline"]["category_shares"]["values"]
    assert sum(shares.values()) == pytest.approx(1)
    # "Cmax" and "cmax " are the same text: 2 distinct anchors, so shares are multiples of 1/2
    assert all(s in (0, 0.5, 1) for s in shares.values())


def test_packaging_refuses_uncommitted_inputs(training_repo, tmp_path):
    with open(training_repo / "data" / "endpoints_data.csv", "a") as f:
        f.write("New,Cost\n")
    with pytest.raises(SystemExit, match="uncommitted"):
        package_model.main([str(training_repo), "--output", str(tmp_path / "out"), *ARGS])


def test_packaging_checks_the_confidence_shares(training_repo, tmp_path):
    bad = ARGS[:-1] + ["0.5,0.5"]
    with pytest.raises(SystemExit, match="shares"):
        package_model.main([str(training_repo), "--output", str(tmp_path / "out"), *bad])
