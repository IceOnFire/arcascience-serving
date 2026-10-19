"""Package a trained classifier for serving: copy its weights and write model/manifest.json.

The manifest pins the weights (by sha256) to the embedding space they were trained on,
and records where they came from. What can be read from the checkpoint or from git is
derived; what only exists in the notebooks (metrics, embedding model) is passed explicitly.

It also records a baseline for drift monitoring: what the model's outputs looked like
before deployment, for the live outputs to be compared against.

Usage:
  python scripts/package_model.py ../../technical_test \
      --accuracy 0.739 --macro-f1 0.716 --test-confidence 0.080,0.128,0.181,0.611
"""

import argparse
import csv
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.classifier import EndpointClassifier  # noqa: E402

MODEL_DIR = Path(__file__).resolve().parent.parent / "model"
# Paths inside the training repo
CHECKPOINT = "models/endpoint_classifier.pt"
DATASET = "data/endpoints_data.csv"
EMBEDDINGS = "embeddings/anchor.npy"           # one row per dataset row, from optimized_embedder.py
CONFIDENCE_BINS = [0.0, 0.5, 0.7, 0.9, 1.0]    # the bins of part2.ipynb, Section 9


def git(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, check=True).stdout.strip()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", type=Path, help="Training repository (the technical test submission)")
    parser.add_argument("--output", type=Path, default=MODEL_DIR, help=f"Where to write (default: {MODEL_DIR})")
    parser.add_argument("--version", default="1.0.0", help="Classifier version to publish")
    parser.add_argument("--embedding-model", default="arca-endpoint-embedder",
                        help="Embedding model the classifier was trained on (MODEL_NAME in optimized_embedder.py)")
    parser.add_argument("--accuracy", type=float, required=True, help="Test accuracy, from part2.ipynb")
    parser.add_argument("--macro-f1", type=float, required=True, help="Test macro-F1, from part2.ipynb")
    parser.add_argument("--review-threshold", type=float, default=0.9,
                        help="Below this confidence a prediction needs human review (part2.ipynb, Section 9)")
    parser.add_argument("--test-confidence", required=True,
                        help=f"Share of test items per confidence bin {CONFIDENCE_BINS}, comma-separated "
                             "(share_of_test in part2.ipynb, Section 9)")
    args = parser.parse_args(argv)
    test_confidence = [float(x) for x in args.test_confidence.split(",")]
    if len(test_confidence) != len(CONFIDENCE_BINS) - 1 or abs(sum(test_confidence) - 1) > 0.01:
        raise SystemExit(f"--test-confidence needs {len(CONFIDENCE_BINS) - 1} shares summing to 1")

    # Provenance: only package files that are committed, so the manifest points at them exactly
    for path in (CHECKPOINT, DATASET, EMBEDDINGS):
        if git(args.source, "status", "--porcelain", path):
            raise SystemExit(f"{path} has uncommitted changes in {args.source}")
    commit = git(args.source, "rev-parse", "--short", "HEAD")
    trained_on = git(args.source, "log", "-1", "--format=%cs", "--", CHECKPOINT)
    remote = git(args.source, "remote", "get-url", "origin").removesuffix(".git")

    src = args.source / CHECKPOINT
    checkpoint = torch.load(src, map_location="cpu", weights_only=True)
    dimension = checkpoint["state_dict"]["net.1.weight"].shape[1]   # input size of the first layer

    category_shares = predicted_shares(args.source, checkpoint, dimension)

    args.output.mkdir(parents=True, exist_ok=True)
    dst = args.output / src.name
    shutil.copyfile(src, dst)

    manifest = {
        "classifier": {
            "name": "endpoint-classifier",
            "version": args.version,
            "file": dst.name,
            "sha256": hashlib.sha256(dst.read_bytes()).hexdigest(),
            "classes": checkpoint["classes"],
            "source": f"{remote}/tree/{commit} ({CHECKPOINT})",
            "trained_on": trained_on,
        },
        "embedding": {"model": args.embedding_model, "dimension": dimension, "normalize": True},
        "evaluation": {
            "accuracy": args.accuracy,
            "macro_f1": args.macro_f1,
            "protocol": "test sets of unseen endpoint texts (split by text), mean over 5 splits",
        },
        "review_threshold": args.review_threshold,
        "baseline": {
            "category_shares": {
                "values": category_shares,
                "source": "predictions on the distinct anchor texts of the dataset (training texts included)",
            },
            "confidence": {
                "bins": CONFIDENCE_BINS,
                "shares": test_confidence,
                "source": "test set of the final model (part2.ipynb, Section 9)",
            },
        },
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Packaged {dst.name} v{args.version} from {commit}: {len(checkpoint['classes'])} classes, "
          f"{dimension}-dim input, sha256 {manifest['classifier']['sha256'][:12]}...")


def predicted_shares(source, checkpoint, dimension):
    """Share of each predicted category over the dataset's distinct anchor texts.

    The categories a model predicts, not the true labels: live predictions are compared with
    this, so both sides must include the model's own biases. Training texts are included, so
    these shares are slightly closer to the true labels than on unseen text.
    """
    with open(source / DATASET, newline="") as f:
        anchors = [row["anchor"].lower().strip() for row in csv.DictReader(f)]
    first_row = {}
    for i, text in enumerate(anchors):           # same grouping as part2.ipynb: lowercased, stripped
        first_row.setdefault(text, i)
    X = np.load(source / EMBEDDINGS)[list(first_row.values())].astype(np.float32)

    cfg = checkpoint["config"]
    model = EndpointClassifier(in_dim=dimension, hidden=tuple(cfg["hidden"]), n_classes=len(checkpoint["classes"]),
                               dropout=cfg["dropout"], input_dropout=cfg["input_dropout"])
    model.load_state_dict(checkpoint["state_dict"])
    model.eval()
    with torch.inference_mode():
        predicted = model(torch.from_numpy(X)).argmax(1).numpy()
    counts = np.bincount(predicted, minlength=len(checkpoint["classes"]))
    return {c: round(float(n / len(X)), 4) for c, n in zip(checkpoint["classes"], counts)}


if __name__ == "__main__":
    main()
