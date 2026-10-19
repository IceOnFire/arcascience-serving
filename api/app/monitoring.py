"""Monitoring: Prometheus metrics for ops, and drift statistics against the manifest's baseline.

Prometheus counters live in memory and reset on restart: the Prometheus server that scrapes
them keeps the history. Drift statistics are read from the prediction log, so they survive.
"""

import math

import numpy as np
from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram

from .store import PredictionLog

# Population Stability Index: the usual rule of thumb for how far a distribution has moved
PSI_MODERATE, PSI_SIGNIFICANT = 0.1, 0.25
MIN_WINDOW = 100   # below this, shares are too noisy to compare


def psi(expected, actual, eps=1e-4):
    """Population Stability Index between two discrete distributions (lists of shares)."""
    return sum((a - e) * math.log(a / e)
               for e, a in ((max(e, eps), max(a, eps)) for e, a in zip(expected, actual)))


def drift_status(value):
    if value >= PSI_SIGNIFICANT:
        return "significant"
    return "moderate" if value >= PSI_MODERATE else "stable"


class Monitor:
    def __init__(self, manifest, log: PredictionLog, window_size=1000):
        self.log, self.window_size = log, window_size
        self.version = manifest["classifier"]["version"]
        self.classes = manifest["classifier"]["classes"]
        self.threshold = manifest["review_threshold"]
        self.baseline = manifest["baseline"]
        self.bins = self.baseline["confidence"]["bins"]
        if self.bins[-2] != self.threshold:
            raise ValueError("the last confidence bin must start at the review threshold")

        # A registry per app instead of the global one, so tests can build several apps
        self.registry = CollectorRegistry()
        Gauge("model_info", "Model being served", ["version", "embedding_model"], registry=self.registry) \
            .labels(manifest["classifier"]["version"], manifest["embedding"]["model"]).set(1)
        self.predictions = Counter("predictions", "Predictions made, by category", ["category"],
                                   registry=self.registry)
        self.reviews = Counter("predictions_needs_review", "Predictions below the review threshold",
                               registry=self.registry)
        self.confidence = Histogram("prediction_confidence", "Confidence of each prediction",
                                    buckets=[0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99], registry=self.registry)
        self.embed_latency = Histogram("embedding_request_seconds", "Time to embed one /predict request",
                                       registry=self.registry)
        self.embed_errors = Counter("embedding_errors", "Requests that failed because the embedding API did",
                                    registry=self.registry)

    def record(self, texts, proba):
        """Record a batch of predictions (probabilities, one row per text). Blocking: writes to the log."""
        categories = [self.classes[k] for k in proba.argmax(1)]
        confidences = proba.max(1)
        for c, conf in zip(categories, confidences):
            self.predictions.labels(c).inc()
            self.confidence.observe(conf)
            if conf < self.threshold:
                self.reviews.inc()
        self.log.insert(self.version, texts, categories, confidences, self.threshold)

    def stats(self):
        """The latest predictions of this model version, compared with its baseline. Blocking: reads the log."""
        rows = self.log.recent(self.version, self.window_size)   # newest first
        n = len(rows)
        result = {"window": {"size": n, "capacity": self.window_size, "since": rows[-1][0] if n else None}}
        if not n:
            return result | {"drift": None}

        index = {c: i for i, c in enumerate(self.classes)}
        cats = np.array([index[c] for _, c, _ in rows])
        confs = np.array([conf for _, _, conf in rows])
        cat_shares = (np.bincount(cats, minlength=len(self.classes)) / n).tolist()
        # Same bins as the baseline; the last one includes 1.0
        conf_counts, _ = np.histogram(confs, bins=self.bins)
        conf_shares = (conf_counts / n).tolist()
        base_cats = [self.baseline["category_shares"]["values"][c] for c in self.classes]
        base_conf = self.baseline["confidence"]["shares"]

        result |= {
            "review_rate": float((confs < self.threshold).mean()),
            "baseline_review_rate": 1 - base_conf[-1],   # last bin is [threshold, 1]
            "categories": [{"category": c, "share": s, "baseline": b}
                           for c, s, b in zip(self.classes, cat_shares, base_cats)],
            "confidence": [{"bin": [lo, hi], "share": s, "baseline": b}
                           for lo, hi, s, b in zip(self.bins, self.bins[1:], conf_shares, base_conf)],
        }
        if n < MIN_WINDOW:
            return result | {"drift": None}
        cat_psi, conf_psi = psi(base_cats, cat_shares), psi(base_conf, conf_shares)
        return result | {"drift": {
            "categories": {"psi": cat_psi, "status": drift_status(cat_psi)},
            "confidence": {"psi": conf_psi, "status": drift_status(conf_psi)},
        }}
