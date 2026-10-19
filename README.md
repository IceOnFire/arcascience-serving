# Endpoint classifier API

A FastAPI service that classifies clinical trial endpoints into the 9 categories of the ArcaScience technical test. It serves the classifier I trained for [Part 2 of my submission](https://github.com/IceOnFire/arcascience/tree/1fa67ec), and it implements the "From notebook to production" section of its [`SUBMISSION.md`](https://github.com/IceOnFire/arcascience/blob/1fa67ec/SUBMISSION.md).

This is a follow-up project, written after the submission. The submission repository is left untouched.

```
text ──▶ embedding API ──▶ classifier ──▶ category, confidence, needs_review
         (remote, GPU)     (in process)
```

## Quick start

Requires Python 3.14 (any recent 3.x should work) and an API key for the embedding server. Works on macOS and Linux.

```bash
cd api
cp .env.example .env   # then fill in the three values (see Configuration)
./run.sh
```

On the first run, [`run.sh`](api/run.sh) creates `.venv` and installs the dependencies. Every run then starts the server on http://127.0.0.1:8000. You can change the defaults:

```bash
PORT=9000 ./run.sh                  # another port
HOST=0.0.0.0 ./run.sh               # listen on all interfaces, e.g. in a VM or container
PYTHON=python3.14 ./run.sh          # interpreter used to create .venv
./run.sh --reload                   # extra arguments go to uvicorn
```

The script runs `uvicorn app.main:create_app --factory`. `create_app` is an app factory: uvicorn calls it once at startup. Configuration is read at that moment, not when the module is imported, so tests and scripts can import the code without a `.env`.

Open http://localhost:8000/docs for the interactive documentation. Click **Authorize** and paste your `API_KEY` to try the endpoints from the browser.

## Configuration

Settings are read from environment variables, or from `api/.env` (gitignored). There are no defaults for these three: if one is missing, the server refuses to start and names it.

| Variable | Purpose |
|---|---|
| `API_KEY` | The key callers send in the `X-API-Key` header |
| `EMBEDDING_URL` | The embedding API endpoint |
| `GPU_MODEL_SERVER_API_KEY` | The embedding API key. It is used only server-side and never sent to callers |

Optional: `EMBED_BATCH_SIZE` (128), `EMBED_TIMEOUT` in seconds (30), `EMBED_RETRIES` (3).

## Usage

```bash
curl -X POST localhost:8000/predict \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"texts": ["Maximum plasma concentration (Cmax)", "Number of participants"]}'
```

```json
{
  "model_version": "1.0.0",
  "predictions": [
    {"category": "Pharmacokinetic", "confidence": 0.969, "needs_review": false,
     "top": [{"category": "Pharmacokinetic", "probability": 0.969}, "..."]},
    {"category": "General Case", "confidence": 0.653, "needs_review": true,
     "top": [{"category": "General Case", "probability": 0.653},
             {"category": "Demographic", "probability": 0.27}, "..."]}
  ]
}
```

Predictions are returned in the same order as the input texts.

| Endpoint | Auth | Description |
|---|---|---|
| `POST /predict` | yes | 1 to 256 texts. For each: category, confidence, top 3, `needs_review` |
| `GET /model` | yes | The model manifest: version, embedding space, evaluation |
| `GET /health` | no | Liveness. It doesn't call the embedding API |

Error responses: `401` for a missing or wrong key, `422` for an invalid request (empty list, blank text, more than 256 texts), and `503` with `Retry-After` when the embedding API is unavailable after retries.

## How it works

**`needs_review`.** In Part 2, predictions with confidence above 0.9 covered 61% of the test set and were 89% correct. Below that threshold, a prediction should go to a human. The threshold is part of the model's manifest, not of the code, because it was measured on this specific model.

**Versioning.** The classifier only works in the embedding space it was trained on, so [`model/manifest.json`](api/model/manifest.json) pins both. It records the weights' sha256 and categories, the embedding model and its dimension, the commit the weights come from, and their evaluation. At startup the server refuses weights that don't match the manifest.

**Packaging a model.** [`scripts/package_model.py`](api/scripts/package_model.py) copies the weights from a clone of the submission repository and writes the manifest. Everything that can be read from the checkpoint or from git is derived. The metrics only exist in the notebook outputs, so they're passed explicitly:

```bash
cd api
.venv/bin/python scripts/package_model.py path/to/arcascience --accuracy 0.739 --macro-f1 0.716
```

In a real pipeline, the training job would write the manifest itself.

**Embedding client.** [`app/embedder.py`](api/app/embedder.py) carries over the Part 1B optimizations: deduplication, batching, concurrent batches, connection reuse, and retries with backoff on 429/5xx. It uses async `httpx`, so waiting on the embedding API doesn't block the server. I checked it against the embeddings used for training: on 300 texts the minimum cosine similarity was 0.9996, and all 300 predictions were identical. This rules out any difference between the embeddings the model was trained on and the ones it receives in production.

## Layout

```
api/
  app/
    main.py         app factory, endpoints, authentication, error handling
    schemas.py      request and response models
    classifier.py   the Part 2 network, loaded and checked against the manifest
    embedder.py     async client for the embedding API
    config.py       settings from environment / .env
  model/            weights + manifest.json (generated by scripts/package_model.py)
  scripts/          package_model.py
  run.sh            sets up .venv on first run, then starts the server
```
