# Endpoint classifier API

A FastAPI service that classifies clinical trial endpoints into the 9 categories of the ArcaScience technical test. It serves the classifier I trained for [Part 2 of my submission](https://github.com/IceOnFire/arcascience/tree/1fa67ec), and it implements the "From notebook to production" section of its [`SUBMISSION.md`](https://github.com/IceOnFire/arcascience/blob/1fa67ec/SUBMISSION.md).

This is a follow-up project, written after the submission. The submission repository is left untouched.

## What's here

Putting a model in production raises three questions. Each part of this repository answers one of them:

1. **How do I serve the model?** [`api/`](api/README.md) is a FastAPI service: text goes in, a category comes out, with a confidence and a flag for human review. The model is versioned together with the embedding space it depends on.
2. **How do I know when it stops working?** A model doesn't fail loudly, so the API compares its live predictions with a baseline (`/stats`), and exposes metrics that [`prometheus/`](prometheus/README.md) collects and alerts on, and [`grafana/`](grafana/README.md) displays.
3. **How do I see that happen?** [`demo/`](demo/README.md) has scenarios that make each signal move on purpose: drift, an embedding API outage, the API going down.

```
                      ┌───────────────────────── api/ ─────────────────────────┐
  client ─ /predict ─▶│ embedding API ──▶ classifier ──▶ category, confidence,  │
                      │ (remote, GPU)     (in process)    needs_review          │
                      │                        │                                │
                      │                        ▼                                │
                      │                 prediction log ──▶ /stats: drift against│
                      │                    (SQLite)          the model baseline │
                      │                                                         │
                      │ /metrics: counters (predictions, confidence, latency)   │
                      └──────────────────────────▲──────────────────────────────┘
                                                 │ pulled every 15 s
                                      prometheus/ (history, alert rules)
                                                 │
                                      grafana/ (dashboard)
```

## Quick start

You need an API key for the embedding server, which goes into `api/.env`. The easiest way to create that file is `api/setup.sh` (see [`api/`](api/README.md#setup)), or copy `api/.env.example` and fill it in.

**With Docker**, the API, Prometheus and Grafana start together:

```bash
docker compose up --build -d
```

| Service    | URL                        |
| ---------- | -------------------------- |
| API        | http://localhost:8000/docs |
| Prometheus | http://localhost:9090      |
| Grafana    | http://localhost:3000      |

Every service listens on `localhost` only. Docker doesn't pick another port by itself: if one is taken, for example by `api/run.sh` on 8000, `up` fails, and you can choose others with `API_PORT=8001 PROMETHEUS_PORT=9091 GRAFANA_PORT=3001 docker compose up -d`. Stop with `docker compose down`; add `-v` to also delete the prediction log and the Prometheus history, which are kept in Docker volumes.

Then make the monitoring move with [`demo/demo.sh traffic`](demo/README.md).

**Without Docker**, only the API runs, on Python 3.14 (any recent 3.x should work), on macOS or Linux:

```bash
cd api
./setup.sh             # then fill in the settings it lists, in .env
./run.sh
```

## Monitoring in one page

A model doesn't fail loudly. If the endpoints it receives change, for example a new client sends mostly pharmacokinetic studies, it keeps answering, and accuracy drops without any error. Without labels, two signals are available: what the model predicts, and how confident it is. When the model is packaged, its manifest records what these looked like before deployment: the **baseline**.

Each part of the setup answers a different question:

| Question                                                      | Answered by                                                                       |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Do the live predictions still look like the baseline?         | The API's [`/stats`](api/README.md#drift-statistics-stats): drift scored with PSI |
| What did the model predict for this text, with which version? | The API's [prediction log](api/README.md#prediction-log)                          |
| Is the service healthy? How fast, how many errors?            | [Prometheus](prometheus/README.md) metrics, shown in [Grafana](grafana/README.md) |
| Should someone look at it now?                                | Prometheus [alert rules](prometheus/README.md#alert-rules)                        |

**Two stores, one source of truth.** The prediction log and Prometheus partly overlap: both count predictions by category and confidence. They have different roles:

- The **prediction log is the source of truth** for predictions. It keeps every event with its text and model version, so anything else can be recomputed from it. Drift is computed from the log only.
- **Prometheus metrics are disposable telemetry** for operations: service health, latency, upstream errors, and alerts such as "more than 60% of predictions need review for 15 minutes". They are aggregates and can be lost without losing information. Prometheus can't replace the log, because it stores numbers, not texts: putting texts in its labels is an anti-pattern, since each distinct value becomes a separate time series. Without texts there would be no samples for expert labelling, no audit trail and no way to replay past inputs through a new model.

**Who calls whom.** In HTTP terms, the API is the server and Prometheus is the client that pulls from it; Prometheus is in turn a server for Grafana. The `prometheus_client` package used by the API is named after Prometheus's own terminology, where "client library" means the library embedded in the application being monitored. What the API does with it is usually called _instrumentation_.

Drift is a signal to investigate, not a measure of accuracy: only labels can measure accuracy. That's why the plan also includes having experts periodically label a sample of live predictions (see the limitations below).

## Known limitations and next steps

What this project deliberately leaves out, and what I would do next.

**Model**

- **Simplest model first.** The [appendix](https://github.com/IceOnFire/arcascience/blob/1fa67ec/appendix_classic_baseline.ipynb) of the submission shows that a logistic regression on TF-IDF and embeddings matches the neural network. Before relying on the network in production, I would serve both side by side and compare them on live traffic: same accuracy, simpler to run and to explain.
- **A slightly optimistic baseline.** The category shares in the drift baseline come from the whole dataset, training texts included, so they are a little closer to the true labels than predictions on unseen text would be. A training pipeline that keeps the test split would compute the baseline on it.
- **No accuracy on live data.** Drift shows that the inputs changed, not whether the predictions are still correct. The prediction log keeps the texts so that experts can label a sample; the tooling for that (sampling, a review screen, accuracy over time) doesn't exist yet.
- **Model registry.** The weights are committed to git, and the evaluation metrics are typed by hand into the [packaging command](api/README.md#publishing-a-new-model-version-maintainers-only). In a real pipeline, the training job would write the manifest and publish the model to a registry, and the server would fetch a pinned version at deploy time.
- **PyTorch for a small network.** The classifier is a network of about 460,000 weights that classifies 256 texts in half a millisecond, yet PyTorch is 590 MB of the 800 MB of installed packages, and almost half of the 1.4 GB Docker image. Exporting it to ONNX, or to plain NumPy matrix products, would make the server much lighter.

**Service**

- **One shared API key.** Each client should have its own key, so one can be revoked without affecting the others, or authentication should go through an identity provider (OAuth/JWT). There is also no rate limiting: a caller can send 256 texts per request as fast as it likes.
- **One instance.** The prediction log is a SQLite file, which works for a single server. With several instances, it would move to Postgres.
- **The log grows forever.** Nothing deletes old predictions. A retention policy is needed, and if the texts were sensitive, the log would store a hash instead of the text.
- **No embedding cache.** The same text is embedded again on every request. Since embeddings are deterministic (up to batching noise), a cache keyed by text would save calls to the embedding API and keep the service partly available when that API is down.
- **Liveness only.** `/health` says the process is up, not that it can serve predictions. A readiness check would also verify the embedding API: during the [outage demo](demo/README.md), `/health` keeps answering 200.
- **No notifications.** Prometheus evaluates the alert rules, but sending them anywhere (email, Slack) would need Alertmanager.

**Dependencies**

- **`httpx` to `httpx2`.** The embedding client uses `httpx`, whose last release was in December 2024; development has moved to [`httpx2`](https://github.com/pydantic/httpx2). The tests mock it with `respx`, which only supports `httpx`. Moving to `httpx2` means replacing `respx` with a mock transport, which `httpx2` allows without an extra library.

## Layout

```
README.md           this overview
docker-compose.yml  API + Prometheus + Grafana
api/                the FastAPI service, its model, tests and scripts    → api/README.md
prometheus/         scrape configuration and alert rules                 → prometheus/README.md
grafana/            data source and dashboard, provisioned at startup    → grafana/README.md
demo/               demo scenarios that move the monitoring signals      → demo/README.md
```
