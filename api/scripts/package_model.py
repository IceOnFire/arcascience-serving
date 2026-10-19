"""Package a trained classifier for serving: copy its weights and write model/manifest.json.

The manifest pins the weights (by sha256) to the embedding space they were trained on,
and records where they came from. What can be read from the checkpoint or from git is
derived; what only exists in the notebooks (metrics, embedding model) is passed explicitly.

Usage:
  python scripts/package_model.py ../../technical_test \
      --accuracy 0.739 --macro-f1 0.716
"""

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import torch

MODEL_DIR = Path(__file__).resolve().parent.parent / "model"
CHECKPOINT = "models/endpoint_classifier.pt"   # path inside the training repo


def git(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, check=True).stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", type=Path, help="Training repository (the technical test submission)")
    parser.add_argument("--version", default="1.0.0", help="Classifier version to publish")
    parser.add_argument("--embedding-model", default="arca-endpoint-embedder",
                        help="Embedding model the classifier was trained on (MODEL_NAME in optimized_embedder.py)")
    parser.add_argument("--accuracy", type=float, required=True, help="Test accuracy, from part2.ipynb")
    parser.add_argument("--macro-f1", type=float, required=True, help="Test macro-F1, from part2.ipynb")
    parser.add_argument("--review-threshold", type=float, default=0.9,
                        help="Below this confidence a prediction needs human review (part2.ipynb, Section 9)")
    args = parser.parse_args()

    # Provenance: only package weights that are committed, so the manifest points at them exactly
    if git(args.source, "status", "--porcelain", CHECKPOINT):
        raise SystemExit(f"{CHECKPOINT} has uncommitted changes in {args.source}")
    commit = git(args.source, "rev-parse", "--short", "HEAD")
    trained_on = git(args.source, "log", "-1", "--format=%cs", "--", CHECKPOINT)
    remote = git(args.source, "remote", "get-url", "origin").removesuffix(".git")

    src = args.source / CHECKPOINT
    checkpoint = torch.load(src, map_location="cpu", weights_only=True)
    dimension = checkpoint["state_dict"]["net.1.weight"].shape[1]   # input size of the first layer

    MODEL_DIR.mkdir(exist_ok=True)
    dst = MODEL_DIR / src.name
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
    }
    (MODEL_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Packaged {dst.name} v{args.version} from {commit}: {len(checkpoint['classes'])} classes, "
          f"{dimension}-dim input, sha256 {manifest['classifier']['sha256'][:12]}...")


if __name__ == "__main__":
    main()
