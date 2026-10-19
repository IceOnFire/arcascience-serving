"""Prediction log: one row per prediction, in SQLite.

It survives restarts, and it is what drift statistics, expert labelling samples and audits
are read from. SQLite is a single file and needs no server, which is enough for one instance;
with several, the same table would move to Postgres.
"""

import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS predictions (
    id            INTEGER PRIMARY KEY,
    created_at    REAL    NOT NULL,   -- Unix time
    model_version TEXT    NOT NULL,
    text          TEXT    NOT NULL,   -- kept for expert review; hash or drop it if texts are sensitive
    category      TEXT    NOT NULL,
    confidence    REAL    NOT NULL,
    needs_review  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS predictions_by_model ON predictions (model_version, id);
"""


class PredictionLog:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute("PRAGMA journal_mode=WAL")   # readers don't block the writer
            db.executescript(SCHEMA)

    @contextmanager
    def _connect(self):
        """A short-lived connection per call: safe across threads, and cheap for SQLite.
        Commits on success, rolls back on error, and always closes (sqlite3's own
        context manager only commits)."""
        db = sqlite3.connect(self.path)
        try:
            with db:
                yield db
        finally:
            db.close()

    def insert(self, model_version, texts, categories, confidences, threshold):
        now = time.time()
        rows = [(now, model_version, t, c, float(p), int(p < threshold))
                for t, c, p in zip(texts, categories, confidences)]
        with self._connect() as db:
            db.executemany("INSERT INTO predictions (created_at, model_version, text, category, confidence, "
                           "needs_review) VALUES (?, ?, ?, ?, ?, ?)", rows)

    def recent(self, model_version, limit):
        """The latest `limit` predictions of one model version: (created_at, category, confidence)."""
        with self._connect() as db:
            return db.execute("SELECT created_at, category, confidence FROM predictions "
                              "WHERE model_version = ? ORDER BY id DESC LIMIT ?",
                              (model_version, limit)).fetchall()
