# API

The FastAPI service: it embeds endpoint texts through the remote embedding API, classifies them with the Part 2 network, logs every prediction and exposes monitoring data. See the [main README](../README.md) for how it fits with Prometheus, Grafana and the demo.

## Setup

Requires Python 3.14 (any recent 3.x should work) and an API key for the embedding server. Works on macOS and Linux.

```bash
./setup.sh             # then fill in the settings it lists, in .env
./run.sh
```

[`setup.sh`](setup.sh) creates `.venv`, installs the dependencies, and creates `.env` with a random `API_KEY`. It then lists the settings still empty (`EMBEDDING_URL` and `GPU_MODEL_SERVER_API_KEY`). It's safe to re-run, for example after the dependencies change: it never replaces an existing key. Use `PYTHON=python3.14 ./setup.sh` to choose the interpreter.

[`run.sh`](run.sh) starts the server on http://127.0.0.1:8000. You can change the defaults:

```bash
PORT=9000 ./run.sh                  # another port
HOST=0.0.0.0 ./run.sh               # listen on all interfaces, e.g. in a VM or container
./run.sh --reload                   # extra arguments go to uvicorn
```

`run.sh` runs `uvicorn app.main:create_app --factory`. `create_app` is an app factory: uvicorn calls it once at startup. Configuration is read at that moment, not when the module is imported, so tests and scripts can import the code without a `.env`.

Open http://localhost:8000/docs for the interactive documentation. Click **Authorize** and paste your `API_KEY` to try the endpoints from the browser.

To run the API in Docker together with Prometheus and Grafana, see the [main README](../README.md#quick-start).

## Configuration

Settings are read from environment variables, or from `.env` (gitignored). There are no defaults for these three: if one is missing, the server refuses to start and names it.

| Variable                   | Purpose                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| `API_KEY`                  | The key callers send in the `X-API-Key` header                               |
| `EMBEDDING_URL`            | The embedding API endpoint                                                   |
| `GPU_MODEL_SERVER_API_KEY` | The embedding API key. It is used only server-side and never sent to callers |

Optional: `EMBED_BATCH_SIZE` (128), `EMBED_TIMEOUT` in seconds (30), `EMBED_RETRIES` (3), `STATS_WINDOW` (1000, see [drift statistics](#drift-statistics-stats)) and `DATABASE_PATH` (`var/predictions.sqlite3`, see [prediction log](#prediction-log)).

**The API key.** `API_KEY` isn't issued by anyone: it's a shared secret you choose, and every caller must send the same value. `setup.sh` generates a random one the first time. To rotate it, run [`generate_key.sh`](generate_key.sh) and restart the server: it writes a new key into `.env` (readable only by you) and prints it. To look up the current key:

```bash
grep ^API_KEY= .env
```

A single shared key is enough for a demo. In production, each client would get its own key, so one can be revoked without affecting the others, or authentication would go through an identity provider (OAuth/JWT).

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
    {
      "category": "Pharmacokinetic",
      "confidence": 0.969,
      "needs_review": false,
      "top": [{ "category": "Pharmacokinetic", "probability": 0.969 }, "..."]
    },
    {
      "category": "General Case",
      "confidence": 0.653,
      "needs_review": true,
      "top": [
        { "category": "General Case", "probability": 0.653 },
        { "category": "Demographic", "probability": 0.27 },
        "..."
      ]
    }
  ]
}
```

Predictions are returned in the same order as the input texts.

The two texts show both outcomes. "Maximum plasma concentration (Cmax)" is a textbook pharmacokinetic measure, and the model is confident (0.969). "Number of participants" could be a general count or a demographic description, and the model hesitates between the two (0.653 vs 0.27). It falls below the 0.9 threshold, so it is flagged for review.

More texts to try:

| Text                                           | Prediction                               | Confidence | `needs_review` |
| ---------------------------------------------- | ---------------------------------------- | ---------- | -------------- |
| Incidence of treatment-emergent adverse events | Adverse Event                            | 0.982      | false          |
| Incidence of anti-drug antibodies              | Immunogenicity                           | 0.989      | false          |
| All-cause mortality at 12 months               | Mortality                                | 0.978      | false          |
| Total healthcare costs per patient             | Cost                                     | 0.980      | false          |
| Pain score                                     | General Case (2nd: Pharmacokinetic 0.12) | 0.817      | true           |
| Body weight                                    | General Case (2nd: COA Tool 0.15)        | 0.744      | true           |
| Time to first exacerbation                     | Pharmacokinetic (2nd: General Case 0.26) | 0.661      | true           |

The last row is the reason the flag exists: the top guess is wrong, but the model's low confidence sends it to a human instead of into the results. Confidences can vary in the third decimal between runs, because the embedding server batches requests ([Part 1B](https://github.com/IceOnFire/arcascience/blob/1fa67ec/part1b.ipynb)).

| Endpoint        | Auth | Description                                                                                |
| --------------- | ---- | ------------------------------------------------------------------------------------------ |
| `POST /predict` | yes  | 1 to 256 texts. For each: category, confidence, top 3, `needs_review`                      |
| `GET /model`    | yes  | The model manifest: version, embedding space, evaluation, baseline                         |
| `GET /stats`    | yes  | Recent predictions compared with the model's baseline ([details](#drift-statistics-stats)) |
| `GET /metrics`  | no   | Prometheus metrics ([details](#prometheus-metrics-metrics)). Restrict it at network level  |
| `GET /health`   | no   | Liveness. It doesn't call the embedding API                                                |

**The contract.** [`openapi.json`](openapi.json) is the API's OpenAPI schema, and the [web apps](../web/README.md) generate their TypeScript types from it. It's committed, so an API change shows up in review as a change to the contract. After changing an endpoint or a schema, run `.venv/bin/python scripts/export_openapi.py`; a test fails if the file is out of date. The same schema is served at `/openapi.json`.

Error responses: `401` for a missing or wrong key, `422` for an invalid request (empty list, blank text, more than 256 texts), and `503` with `Retry-After` when the embedding API is unavailable after retries.

## How it works

**`needs_review`.** In Part 2, predictions with confidence above 0.9 covered 61% of the test set and were 89% correct. Below that threshold, a prediction should go to a human. The threshold is part of the model's manifest, not of the code, because it was measured on this specific model.

**Versioning.** The classifier only works in the embedding space it was trained on, so [`model/manifest.json`](model/manifest.json) pins both. It records the weights' sha256 and categories, the embedding model and its dimension, the commit the weights come from, their evaluation and the monitoring baseline. At startup the server refuses weights that don't match the manifest. Both files are generated when a model version is [published](#publishing-a-new-model-version-maintainers-only).

**Embedding client.** [`app/embedder.py`](app/embedder.py) carries over the Part 1B optimizations: deduplication, batching, concurrent batches, connection reuse, and retries with backoff on 429/5xx. It uses async `httpx`, so waiting on the embedding API doesn't block the server. I checked it against the embeddings used for training: on 300 texts the minimum cosine similarity was 0.9996, and all 300 predictions were identical. This rules out any difference between the embeddings the model was trained on and the ones it receives in production.

## Monitoring data

Why the API monitors itself, and how its data relates to Prometheus and Grafana, is explained in the [main README](../README.md#monitoring-in-one-page). This section covers what the API itself provides.

### Prediction log

Every prediction is stored in a SQLite database (`DATABASE_PATH`, gitignored), one row each: time, model version, text, category, confidence, `needs_review`. It survives restarts, and it's what drift statistics, expert labelling samples and audits are read from ("which model version classified this endpoint, and when?"). The texts are kept so experts can review them; if texts were sensitive, the log would store a hash instead. Code: [`app/store.py`](app/store.py).

SQLite is a single file and needs no database server, which is enough for one instance. With several instances, the same table would move to Postgres.

### Drift statistics: `/stats`

The manifest records a **baseline**: what the model's outputs looked like before deployment. For categories, it's the share of each predicted category over the dataset. For confidence, it's the distribution on the Part 2 test set, which is 39% below the review threshold.

`GET /stats` compares the last 1000 predictions of the current model version (`STATS_WINDOW`) with that baseline. After a model upgrade, the new version starts with an empty window and is compared with its own baseline. The comparison covers category shares, confidence distribution and review rate. For each of the two distributions, it computes the Population Stability Index (PSI), the usual measure of how far a distribution has moved: below 0.1 is _stable_, 0.1 to 0.25 _moderate_, 0.25 and above _significant_. Drift is reported once the window holds at least 100 predictions; below that, shares are too noisy. Code: [`app/monitoring.py`](app/monitoring.py).

A test against the live embedding API:

| Traffic                           | Categories          | Confidence       | Review rate |
| --------------------------------- | ------------------- | ---------------- | ----------- |
| 300 random texts from the dataset | stable (0.018)      | moderate (0.121) | 26%         |
| then 256 pharmacokinetic texts    | significant (0.652) | moderate (0.181) | 22%         |

The category drift is the one the test was built to show: Pharmacokinetic goes from 15% of predictions to 51%. The confidence drift on "normal" traffic is also correct. The baseline describes unseen text, but the dataset texts are mostly ones the model was trained on, so it is more confident on them than the baseline expects. A rise in confidence is a change in the input too. The [demo](../demo/README.md) reproduces both cases with texts written for it.

### Prometheus metrics: `/metrics`

`GET /metrics` exposes, in Prometheus's text format: predictions per category (`predictions_total`), a confidence histogram (`prediction_confidence`), the review count (`predictions_needs_review_total`), embedding latency and errors (`embedding_request_seconds`, `embedding_errors_total`), and the model version (`model_info`). The counters are in memory and reset when the server restarts; [Prometheus](../prometheus/README.md) keeps the history. The endpoint has no authentication, which is the Prometheus convention: it exposes only aggregates, never texts, and should be reachable only from the monitoring network.

## Docker image

[`Dockerfile`](Dockerfile) builds an image that contains only the app, the model and the runtime dependencies ([`requirements.txt`](requirements.txt); the test tools are in `requirements-dev.txt`), and runs as an unprivileged user. It installs PyTorch's CPU-only build: the default build for x86_64 Linux bundles several GB of CUDA libraries that a CPU server never uses. The image is still 1.4 GB, almost half of it PyTorch. The keys are read from `.env` when the container starts and are never copied into the image. The prediction log is written to `/data`, a volume in [`docker-compose.yml`](../docker-compose.yml).

## Tests

```bash
./test.sh                      # all tests
./test.sh -k stats             # extra arguments go to pytest
```

The tests need no network and no API key: the embedding API is mocked with [respx](https://lundberg.github.io/respx/). The example texts above get their real embeddings, captured once from the API into [`tests/fixtures/embeddings.json`](tests/fixtures/embeddings.json), so the tests check real predictions: Cmax is confident, "Number of participants" is flagged. Any other text gets a deterministic random vector.

They cover the API contract (authentication, validation, order of predictions, deduplication, the upstream key never reaching callers), upstream failures (retry, 503, malformed responses), the manifest checks (tampered weights, wrong categories), monitoring (PSI, drift window, model versions, persistence across restarts) and the packaging script, run on a throwaway git repository.

To check that the tests can fail, I broke the code five ways (inverted `needs_review`, no deduplication, no model-version filter, oldest window instead of newest, no hash check): each one made at least one test fail. The first version of the tests missed the model-version filter; that test is fixed.

## Publishing a new model version (maintainers only)

You don't need this to run the server: the model is already in [`model/`](model/), committed with this repository. This section is for whoever publishes a new version of the classifier, for example after retraining it.

```
 MAINTAINER, once per model version           ANYONE, to run the server
 ──────────────────────────────────           ─────────────────────────
 local clone of the training repo             git clone this repo
   models/endpoint_classifier.pt                     │
   data/endpoints_data.csv                    ./setup.sh
   embeddings/anchor.npy                             │
          │                                   ./run.sh  (loads model/,
 scripts/package_model.py                               checks the sha256)
          │
          ▼
 model/endpoint_classifier.pt  ──── committed ────▶  used by the server
 model/manifest.json
```

[`scripts/package_model.py`](scripts/package_model.py) reads a local clone of the training repository (the [submission](https://github.com/IceOnFire/arcascience/tree/1fa67ec)); it downloads nothing. It copies the weights into `model/` and writes the manifest:

- from the checkpoint: the sha256, the categories, the input dimension;
- from git: the source commit and the training date. It refuses to run if the weights, the dataset or the embeddings have uncommitted changes, so the manifest always points at exact files;
- the [monitoring baseline](#drift-statistics-stats): the model's predicted category shares over the dataset.

The evaluation metrics and the test confidence distribution only exist in the notebook outputs, so they're passed explicitly:

```bash
.venv/bin/python scripts/package_model.py path/to/arcascience --version 1.0.0 \
    --accuracy 0.739 --macro-f1 0.716 --test-confidence 0.080,0.128,0.181,0.611
git add model/ && git commit -m "Publish classifier v1.0.0"
```

Committing a 1.8 MB file to git stands in for a model registry. In a real pipeline, the training job would run this step itself and push the result to a registry (MLflow, or a versioned S3 bucket), and the server would fetch a pinned version at deploy time.

## Layout

```
app/
  main.py           app factory, endpoints, authentication, error handling
  schemas.py        request and response models
  classifier.py     the Part 2 network, loaded and checked against the manifest
  embedder.py       async client for the embedding API
  monitoring.py     Prometheus metrics, drift statistics against the baseline
  store.py          prediction log (SQLite)
  config.py         settings from environment / .env
model/              weights + manifest.json (generated by scripts/package_model.py)
scripts/            package_model.py, export_openapi.py
openapi.json        the API contract, generated by scripts/export_openapi.py
tests/              pytest suite, embedding API mocked
var/                prediction log, created at startup (gitignored)
setup.sh            creates .venv, installs dependencies, creates .env with a random API_KEY
run.sh              starts the server
test.sh             runs the test suite
generate_key.sh     writes a new random API_KEY to .env (rotation)
Dockerfile          the API image
requirements.txt    runtime dependencies (requirements-dev.txt adds the test tools)
```
