"""The Part 2 classifier, loaded once and checked against its manifest."""

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn


class EndpointClassifier(nn.Module):
    """Copied unchanged from part2.ipynb, so the saved state_dict loads as is."""

    def __init__(self, in_dim=768, hidden=(512, 128), n_classes=9, dropout=0.3, input_dropout=0.1):
        super().__init__()
        layers, prev = [nn.Dropout(input_dropout)], in_dim
        for h in hidden:
            layers += [nn.Linear(prev, h), nn.LayerNorm(h), nn.GELU(), nn.Dropout(dropout)]
            prev = h
        layers.append(nn.Linear(prev, n_classes))
        self.net = nn.Sequential(*layers)

    def forward(self, x):
        return self.net(x)


@dataclass(frozen=True)
class LoadedModel:
    model: EndpointClassifier
    classes: list[str]
    manifest: dict

    @torch.inference_mode()
    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Probabilities per category, shape (len(X), n_classes)."""
        return self.model(torch.from_numpy(X)).softmax(1).numpy()


def load_model(model_dir: Path) -> LoadedModel:
    """Load the weights named in manifest.json, refusing files that don't match its hash.

    The classifier only makes sense in the embedding space it was trained on, so the
    manifest pins both: these exact weights, and the embedding model and dimension.
    """
    manifest = json.loads((model_dir / "manifest.json").read_text())
    path = model_dir / manifest["classifier"]["file"]
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != manifest["classifier"]["sha256"]:
        raise RuntimeError(f"{path.name} does not match manifest.json (sha256 {digest[:12]}...)")

    checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    if checkpoint["classes"] != manifest["classifier"]["classes"]:
        raise RuntimeError("categories in the checkpoint don't match manifest.json")
    cfg = checkpoint["config"]
    model = EndpointClassifier(in_dim=manifest["embedding"]["dimension"], hidden=tuple(cfg["hidden"]),
                               n_classes=len(checkpoint["classes"]), dropout=cfg["dropout"],
                               input_dropout=cfg["input_dropout"])
    model.load_state_dict(checkpoint["state_dict"])
    model.eval()  # dropout off
    return LoadedModel(model=model, classes=checkpoint["classes"], manifest=manifest)
