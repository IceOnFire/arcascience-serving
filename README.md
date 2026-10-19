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
./setup.sh             # then fill in the settings it lists, in .env
./run.sh
```

[`setup.sh`](api/setup.sh) creates `.venv`, installs the dependencies, and creates `.env` with a random `API_KEY`. It then lists the settings still empty (`EMBEDDING_URL` and `GPU_MODEL_SERVER_API_KEY`). It's safe to re-run, for example after the dependencies change: it never replaces an existing key. Use `PYTHON=python3.14 ./setup.sh` to choose the interpreter.

[`run.sh`](api/run.sh) starts the server on http://127.0.0.1:8000. You can change the defaults:

```bash
PORT=9000 ./run.sh                  # another port
HOST=0.0.0.0 ./run.sh               # listen on all interfaces, e.g. in a VM or container
./run.sh --reload                   # extra arguments go to uvicorn
```

`run.sh` runs `uvicorn app.main:create_app --factory`. `create_app` is an app factory: uvicorn calls it once at startup. Configuration is read at that moment, not when the module is imported, so tests and scripts can import the code without a `.env`.

Open http://localhost:8000/docs for the interactive documentation. Click **Authorize** and paste your `API_KEY` to try the endpoints from the browser.

## Run with Docker

With Docker installed, the API and a [Prometheus](#monitoring) server start together. Only `api/.env` is needed (run `./setup.sh` once to create it, or copy `.env.example` and fill it in):

```bash
docker compose up --build -d
```

| Service    | URL                        |
| ---------- | -------------------------- |
| API        | http://localhost:8000/docs |
| Prometheus | http://localhost:9090      |
| Grafana    | http://localhost:3000      |

Both listen on `localhost` only. If a port is taken, for example by `./run.sh` on 8000, choose others: `API_PORT=8001 PROMETHEUS_PORT=9091 GRAFANA_PORT=3001 docker compose up -d`. Stop with `docker compose down`; add `-v` to also delete the prediction log and the Prometheus history, which are kept in Docker volumes. Docker doesn't pick another port by itself: if one is taken, `up` fails.

The [image](api/Dockerfile) contains only the app, the model and the runtime dependencies, and runs as an unprivileged user. It installs PyTorch's CPU-only build: the default build for x86_64 Linux bundles several GB of CUDA libraries that a CPU server never uses. The image is still 1.4 GB, almost half of it PyTorch (see [limitations](#known-limitations-and-next-steps)). The keys are read from `api/.env` when the container starts and are never copied into the image.

## Configuration

Settings are read from environment variables, or from `api/.env` (gitignored). There are no defaults for these three: if one is missing, the server refuses to start and names it.

| Variable                   | Purpose                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| `API_KEY`                  | The key callers send in the `X-API-Key` header                               |
| `EMBEDDING_URL`            | The embedding API endpoint                                                   |
| `GPU_MODEL_SERVER_API_KEY` | The embedding API key. It is used only server-side and never sent to callers |

Optional: `EMBED_BATCH_SIZE` (128), `EMBED_TIMEOUT` in seconds (30), `EMBED_RETRIES` (3), `STATS_WINDOW` (1000) and `DATABASE_PATH` (`api/var/predictions.sqlite3`), see [Monitoring](#monitoring).

**The API key.** `API_KEY` isn't issued by anyone: it's a shared secret you choose, and every caller must send the same value. `setup.sh` generates a random one the first time. To rotate it, run [`generate_key.sh`](api/generate_key.sh) and restart the server: it writes a new key into `.env` (readable only by you) and prints it. To look up the current key:

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

| Endpoint        | Auth | Description                                                                           |
| --------------- | ---- | ------------------------------------------------------------------------------------- |
| `POST /predict` | yes  | 1 to 256 texts. For each: category, confidence, top 3, `needs_review`                 |
| `GET /model`    | yes  | The model manifest: version, embedding space, evaluation                              |
| `GET /stats`    | yes  | Recent predictions compared with the model's baseline (see [Monitoring](#monitoring)) |
| `GET /metrics`  | no   | Prometheus metrics. Aggregates only: restrict it at network level                     |
| `GET /health`   | no   | Liveness. It doesn't call the embedding API                                           |

Error responses: `401` for a missing or wrong key, `422` for an invalid request (empty list, blank text, more than 256 texts), and `503` with `Retry-After` when the embedding API is unavailable after retries.

## Monitoring

A model doesn't fail loudly. If the endpoints it receives change, for example a new client sends mostly pharmacokinetic studies, it keeps answering, and accuracy drops without any error. Monitoring watches the two signals available without labels: what the model predicts, and how confident it is.

**Baseline.** The manifest records what these looked like before deployment. For categories, it's the share of each predicted category over the dataset. For confidence, it's the distribution on the Part 2 test set, which is 39% below the review threshold.

**Prediction log.** Every prediction is stored in a SQLite database (`DATABASE_PATH`, gitignored), one row each: time, model version, text, category, confidence, `needs_review`. It survives restarts, and it's what drift statistics, expert labelling samples and audits are read from ("which model version classified this endpoint, and when?"). The texts are kept so experts can review them; if texts were sensitive, the log would store a hash instead.

**`GET /stats`** compares the last 1000 predictions of the current model version (`STATS_WINDOW`) with that baseline. After a model upgrade, the new version starts with an empty window and is compared with its own baseline. The comparison covers category shares, confidence distribution, review rate. For each of the two distributions, it computes the Population Stability Index (PSI), the usual measure of how far a distribution has moved: below 0.1 is _stable_, 0.1 to 0.25 _moderate_, 0.25 and above _significant_. Drift is reported once the window holds at least 100 predictions; below that, shares are too noisy.

A test against the live embedding API:

| Traffic                           | Categories          | Confidence       | Review rate |
| --------------------------------- | ------------------- | ---------------- | ----------- |
| 300 random texts from the dataset | stable (0.018)      | moderate (0.121) | 26%         |
| then 256 pharmacokinetic texts    | significant (0.652) | moderate (0.181) | 22%         |

The category drift is the one the test was built to show: Pharmacokinetic goes from 15% of predictions to 51%. The confidence drift on "normal" traffic is also correct. The baseline describes unseen text, but the dataset texts are mostly ones the model was trained on, so it is more confident on them than the baseline expects. A rise in confidence is a change in the input too.

Drift is a signal to investigate, not a measure of accuracy: only labels can measure accuracy. That's why the plan also includes having experts periodically label a sample of live predictions.

**`GET /metrics`** exposes counters for [Prometheus](https://prometheus.io/): predictions per category, a confidence histogram, the review count, embedding latency and errors, and the model version. Prometheus is a separate program that pulls (_scrapes_) `/metrics` every few seconds, stores the values over time and evaluates alert rules, often with Grafana for dashboards. The counters themselves are in memory and reset when this server restarts; the history lives in Prometheus.

[`docker-compose.yml`](docker-compose.yml) runs a Prometheus server that scrapes the API every 15 seconds ([`prometheus/prometheus.yml`](prometheus/prometheus.yml)). In its UI at http://localhost:9090, try these queries:

| Query                                                                                      | Shows                                                    |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `predictions_total`                                                                        | Predictions per category since the API started           |
| `sum(increase(predictions_needs_review_total[1h])) / sum(increase(predictions_total[1h]))` | Share of predictions that needed review in the last hour |
| `histogram_quantile(0.95, rate(embedding_request_seconds_bucket[5m]))`                     | 95th percentile of embedding API latency                 |

Three alert rules are defined in [`prometheus/alerts.yml`](prometheus/alerts.yml) and listed under _Alerts_: the API is unreachable, the embedding API is failing, or more than 60% of predictions need review for 15 minutes (the Part 2 test set had 39%). Prometheus evaluates them, but sending notifications (email, Slack) would need Alertmanager, which this setup doesn't include. The review-rate alert only fires with at least 50 predictions in the hour: like the 100-prediction minimum in `/stats`, it keeps a handful of ambiguous texts from raising an alarm.

**Grafana** (http://localhost:3000, no login needed) opens on the _Endpoint classifier_ dashboard: model version, predictions, review share, embedding errors and firing alerts at the top; below, predictions per minute by category, the review share over time against the 39% test-set level and the 60% alert threshold, the confidence distribution, and the embedding API latency (p50, p95).

The data source and the dashboard are [provisioned from files](grafana/) at startup, so there is nothing to set up by hand, and the dashboard is versioned with the code. To change it, edit [`grafana/dashboards/endpoint-classifier.json`](grafana/dashboards/endpoint-classifier.json), not the UI. Visitors on `localhost` get read-only access without logging in; the admin login is `admin`/`admin`, which is acceptable only because every port listens on `localhost`.

Grafana and the [`/stats`](#monitoring) endpoint answer different questions. Grafana shows the service over time, from Prometheus. Comparing live predictions with the model's baseline needs the baseline and the PSI computation, which only the API has.

In HTTP terms, this API is the server and Prometheus is the client that pulls from it; Prometheus is in turn a server for Grafana. The `prometheus_client` package is named after Prometheus's own terminology, where "client library" means the library embedded in the application being monitored. What [`monitoring.py`](api/app/monitoring.py) does is usually called _instrumentation_.

**Two stores, one source of truth.** The prediction log and Prometheus partly overlap: both count predictions by category and confidence. They have different roles:

- The **prediction log is the source of truth** for predictions. It keeps every event with its text and model version, so anything else can be recomputed from it. Drift is computed from the log only.
- **Prometheus metrics are disposable telemetry** for operations: service health, latency, upstream errors, and alerts such as "review rate above 50% for an hour". They are aggregates and can be lost without losing information. Prometheus can't replace the log, because it stores numbers, not texts: putting texts in its labels is an anti-pattern, since each distinct value becomes a separate time series. Without texts there would be no samples for expert labelling, no audit trail and no way to replay past inputs through a new model.

SQLite is a single file and needs no database server, which is enough for one instance. With several instances, the same table would move to Postgres.

## How it works

**`needs_review`.** In Part 2, predictions with confidence above 0.9 covered 61% of the test set and were 89% correct. Below that threshold, a prediction should go to a human. The threshold is part of the model's manifest, not of the code, because it was measured on this specific model.

**Versioning.** The classifier only works in the embedding space it was trained on, so [`model/manifest.json`](api/model/manifest.json) pins both. It records the weights' sha256 and categories, the embedding model and its dimension, the commit the weights come from, and their evaluation. At startup the server refuses weights that don't match the manifest. Both files are generated when a model version is published (see [below](#publishing-a-new-model-version-maintainers-only)).

**Embedding client.** [`app/embedder.py`](api/app/embedder.py) carries over the Part 1B optimizations: deduplication, batching, concurrent batches, connection reuse, and retries with backoff on 429/5xx. It uses async `httpx`, so waiting on the embedding API doesn't block the server. I checked it against the embeddings used for training: on 300 texts the minimum cosine similarity was 0.9996, and all 300 predictions were identical. This rules out any difference between the embeddings the model was trained on and the ones it receives in production.

## Tests

```bash
cd api
./test.sh                      # all tests
./test.sh -k stats             # extra arguments go to pytest
```

The tests need no network and no API key: the embedding API is mocked with [respx](https://lundberg.github.io/respx/). The README's example texts get their real embeddings, captured once from the API into [`tests/fixtures/embeddings.json`](api/tests/fixtures/embeddings.json), so the tests check real predictions: Cmax is confident, "Number of participants" is flagged. Any other text gets a deterministic random vector.

They cover the API contract (authentication, validation, order of predictions, deduplication, the upstream key never reaching callers), upstream failures (retry, 503, malformed responses), the manifest checks (tampered weights, wrong categories), monitoring (PSI, drift window, model versions, persistence across restarts) and the packaging script, run on a throwaway git repository.

To check that the tests can fail, I broke the code five ways (inverted `needs_review`, no deduplication, no model-version filter, oldest window instead of newest, no hash check): each one made at least one test fail. The first version of the tests missed the model-version filter; that test is fixed.

## Publishing a new model version (maintainers only)

You don't need this to run the server: the model is already in [`api/model/`](api/model/), committed with this repository. This section is for whoever publishes a new version of the classifier, for example after retraining it.

```
 MAINTAINER, once per model version           ANYONE, to run the server
 ──────────────────────────────────           ─────────────────────────
 local clone of the training repo             git clone this repo
   models/endpoint_classifier.pt                     │
   data/endpoints_data.csv                    ./setup.sh
   embeddings/anchor.npy                             │
          │                                   ./run.sh  (loads api/model/,
 scripts/package_model.py                               checks the sha256)
          │
          ▼
 api/model/endpoint_classifier.pt  ──── committed ────▶  used by the server
 api/model/manifest.json
```

[`scripts/package_model.py`](api/scripts/package_model.py) reads a local clone of the training repository (the [submission](https://github.com/IceOnFire/arcascience/tree/1fa67ec)); it downloads nothing. It copies the weights into `api/model/` and writes the manifest:

- from the checkpoint: the sha256, the categories, the input dimension;
- from git: the source commit and the training date. It refuses to run if the weights, the dataset or the embeddings have uncommitted changes, so the manifest always points at exact files;
- the [monitoring](#monitoring) baseline: the model's predicted category shares over the dataset.

The evaluation metrics and the test confidence distribution only exist in the notebook outputs, so they're passed explicitly:

```bash
cd api
.venv/bin/python scripts/package_model.py path/to/arcascience --version 1.0.0 \
    --accuracy 0.739 --macro-f1 0.716 --test-confidence 0.080,0.128,0.181,0.611
git add model/ && git commit -m "Publish classifier v1.0.0"
```

Committing a 1.8 MB file to git stands in for a model registry. In a real pipeline, the training job would run this step itself and push the result to a registry (MLflow, or a versioned S3 bucket), and the server would fetch a pinned version at deploy time.

## Known limitations and next steps

What this project deliberately leaves out, and what I would do next.

**Model**

- **Simplest model first.** The [appendix](https://github.com/IceOnFire/arcascience/blob/1fa67ec/appendix_classic_baseline.ipynb) of the submission shows that a logistic regression on TF-IDF and embeddings matches the neural network. Before relying on the network in production, I would serve both side by side and compare them on live traffic: same accuracy, simpler to run and to explain.
- **A slightly optimistic baseline.** The category shares in the drift baseline come from the whole dataset, training texts included, so they are a little closer to the true labels than predictions on unseen text would be. A training pipeline that keeps the test split would compute the baseline on it.
- **No accuracy on live data.** Drift shows that the inputs changed, not whether the predictions are still correct. The prediction log keeps the texts so that experts can label a sample; the tooling for that (sampling, a review screen, accuracy over time) doesn't exist yet.
- **Model registry.** The weights are committed to git, and the evaluation metrics are typed by hand into the packaging command. In a real pipeline, the training job would write the manifest and publish the model to a registry, and the server would fetch a pinned version at deploy time.
- **PyTorch for a small network.** The classifier is a network of about 460,000 weights that classifies 256 texts in half a millisecond, yet PyTorch is 590 MB of the 800 MB of installed packages. Exporting it to ONNX, or to plain NumPy matrix products, would make the server much lighter.

**Service**

- **One shared API key.** Each client should have its own key, so one can be revoked without affecting the others, or authentication should go through an identity provider (OAuth/JWT). There is also no rate limiting: a caller can send 256 texts per request as fast as it likes.
- **One instance.** The prediction log is a SQLite file, which works for a single server. With several instances, it would move to Postgres.
- **The log grows forever.** Nothing deletes old predictions. A retention policy is needed, and if the texts were sensitive, the log would store a hash instead of the text.
- **No embedding cache.** The same text is embedded again on every request. Since embeddings are deterministic (up to batching noise), a cache keyed by text would save calls to the embedding API and keep the service partly available when that API is down.
- **Liveness only.** `/health` says the process is up, not that it can serve predictions. A readiness check would also verify the embedding API.

**Dependencies**

- **`httpx` to `httpx2`.** The embedding client uses `httpx`, whose last release was in December 2024; development has moved to [`httpx2`](https://github.com/pydantic/httpx2). The tests mock it with `respx`, which only supports `httpx`. Moving to `httpx2` means replacing `respx` with a mock transport, which `httpx2` allows without an extra library.

## Layout

```
docker-compose.yml  API + Prometheus + Grafana
prometheus/         scrape configuration and alert rules
grafana/            data source and dashboard, provisioned at startup
api/
  app/
    main.py         app factory, endpoints, authentication, error handling
    schemas.py      request and response models
    classifier.py   the Part 2 network, loaded and checked against the manifest
    embedder.py     async client for the embedding API
    monitoring.py   Prometheus metrics, drift statistics against the baseline
    store.py        prediction log (SQLite)
    config.py       settings from environment / .env
  model/            weights + manifest.json (generated by scripts/package_model.py)
  scripts/          package_model.py
  tests/            pytest suite, embedding API mocked
  var/              prediction log, created at startup (gitignored)
  setup.sh          creates .venv, installs dependencies, creates .env with a random API_KEY
  run.sh            starts the server
  test.sh           runs the test suite
  Dockerfile        the API image
  requirements.txt  runtime dependencies (requirements-dev.txt adds the test tools)
  generate_key.sh   writes a new random API_KEY to .env (rotation)
```
