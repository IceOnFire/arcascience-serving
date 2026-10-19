# Demo scenarios

[`demo.sh`](demo.sh) makes each monitoring signal move on purpose, against the [Docker setup](../README.md#quick-start). It sends texts written for the demo (not taken from the dataset), whose predictions were checked to land clearly on either side of the 0.9 review threshold: confident texts score at least 0.93, ambiguous ones at most 0.88 ([`send.py`](send.py)).

From this folder (the script works from anywhere: it switches to the repository root, where `docker-compose.yml` is):

```bash
./demo.sh traffic        # normal traffic
./demo.sh status         # /stats summary and Prometheus alerts, at any time
```

| Scenario                  | What it does                                                                                                          | What to look at                                                                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./demo.sh traffic [100]` | Normal traffic: categories and confidence in the baseline's proportions (about 39% need review)                       | Grafana: predictions per minute, review share near the 39% line. `/stats`: drift _stable_                                                                                                                        |
| `./demo.sh drift [400]`   | Only pharmacokinetic endpoints, as if a new client sent only PK studies                                               | `/stats`: category drift _significant_. Grafana: the Pharmacokinetic band grows                                                                                                                                  |
| `./demo.sh review [60]`   | Only ambiguous endpoints                                                                                              | `/stats`: review rate rises. Grafana: _Needs review_ turns orange, then red. Prometheus: `HighReviewRate` becomes _pending_ once ambiguous predictions are over 60% of the last hour, and fires after 15 minutes |
| `./demo.sh outage`        | Points the API at an unreachable embedding API ([`outage.yml`](outage.yml)) and sends 3 requests, which fail with 503 | Grafana: _Embedding errors_ and _Firing alerts_. `EmbeddingApiFailing` fires within a minute. `/health` still says 200: it only checks the process                                                               |
| `./demo.sh down`          | Stops the API container                                                                                               | `ApiDown` fires about a minute later                                                                                                                                                                             |
| `./demo.sh restore`       | Back to normal after `outage` or `down`                                                                               | Alerts resolve: `ApiDown` at once, `EmbeddingApiFailing` 5 minutes after the last error                                                                                                                          |

The timings were measured on the Docker setup: `EmbeddingApiFailing` fired after about 45 seconds, `ApiDown` after about 55.

## Behaviours worth knowing

- **Normal traffic matches the baseline.** `traffic` draws each text's category from the baseline in `/model`, and mixes in ambiguous texts within the category the model predicts for them. That keeps the category shares on the baseline while about 39% need review: 1000 texts gave PSI 0.01 for categories and 0.02 for confidence. The first version picked texts uniformly, and the monitor rightly reported it as drift.
- **Drift is measured on the last 1000 predictions.** After `drift`, the window stays skewed until enough normal traffic replaces it: `./demo.sh traffic 1000` resets it to _stable_. A single `drift` of 150 texts after a full window of normal traffic only reaches _moderate_; that dilution is intended, so that a short burst doesn't count as drift.
- **`HighReviewRate` looks at the last hour**: it needs at least 50 predictions, more than 60% of them flagged. On a fresh stack, the default 60 ambiguous texts are enough. After other scenarios, the hour already holds many predictions: with about 3,600 at 23% review, it took `./demo.sh review 4000` to reach 64%.
- **`outage` and `restore` recreate the API container**, so the Prometheus counters restart from zero (the prediction log is kept). Prometheus handles counter resets in `increase()` and `rate()`, but panels can show a short gap.
- **The demo texts are written in my words, not in the dataset's style**, and the model is less sure about many of them than about the dataset's texts: "Change from baseline in systolic blood pressure" gets 0.41. That's a small, real example of what drift monitoring is for.

To start over with empty data: `docker compose down -v && docker compose up -d`.

## Files

```
demo.sh       the scenarios: sends traffic through send.py, drives Docker for outage/down/restore
send.py       demo texts, traffic generation, /stats and alert summaries (Python standard library only)
outage.yml    Compose override pointing the API at an unreachable embedding API
```
