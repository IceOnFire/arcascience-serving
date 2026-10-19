# Prometheus

[Prometheus](https://prometheus.io/) collects the API's metrics over time and evaluates alert rules. It runs as its own container in [`docker-compose.yml`](../docker-compose.yml), at http://localhost:9090. See the [main README](../README.md#monitoring-in-one-page) for how it relates to the API's own drift statistics and to Grafana.

## How it collects

Prometheus **pulls**: every 15 seconds it calls (_scrapes_) the API's [`/metrics`](../api/README.md#prometheus-metrics-metrics) endpoint and stores each value with a timestamp. The API keeps only the current counters, in memory, and they reset when it restarts; the history lives here. Prometheus handles those resets itself in `rate()` and `increase()`.

[`prometheus.yml`](prometheus.yml) sets the scrape interval and the target, `api:8000`, the API's service name on the Compose network.

## Queries to try

In the UI, under _Query_:

| Query                                                                                      | Shows                                                    |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `predictions_total`                                                                        | Predictions per category since the API started           |
| `sum(increase(predictions_needs_review_total[1h])) / sum(increase(predictions_total[1h]))` | Share of predictions that needed review in the last hour |
| `histogram_quantile(0.95, rate(embedding_request_seconds_bucket[5m]))`                     | 95th percentile of embedding API latency                 |
| `up`                                                                                       | 1 if the last scrape of the API succeeded                |

## Alert rules

[`alerts.yml`](alerts.yml) defines three rules, listed under _Alerts_:

| Alert                 | Fires when                                                                                        | Why                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApiDown`             | No successful scrape for 1 minute                                                                 | The service is unreachable                                                                                                                                                                                      |
| `EmbeddingApiFailing` | Any embedding error in the last 5 minutes                                                         | Without embeddings, every prediction fails with 503. It resolves 5 minutes after the last error                                                                                                                 |
| `HighReviewRate`      | Over 60% of the last hour's predictions need review, for 15 minutes, with at least 50 predictions | The Part 2 test set had 39%. Far above that, the inputs have probably changed. The 50-prediction minimum, like the 100-prediction minimum in `/stats`, keeps a handful of ambiguous texts from raising an alarm |

An alert is _pending_ while its condition holds but its `for` duration hasn't passed yet, then _firing_. Prometheus only evaluates the rules: sending notifications (email, Slack) would need Alertmanager, which this setup doesn't include. The [demo](../demo/README.md) triggers each of them.

Two things I learned while testing them:

- **Matching labels in PromQL.** The first version of `HighReviewRate` divided a labelled series by a `sum()` without labels. PromQL matches series by labels, so the division returned nothing and the alert could never fire. Both sides now use `sum()`.
- **Stale samples after a restart.** When Prometheus restarts, a series that stopped (such as a firing alert) keeps returning its last value for up to 5 minutes, because the restart doesn't record that the series ended. Grafana's _Firing alerts_ panel can count an alert that has already resolved during that time.

## Checking the configuration

`promtool`, shipped in the Prometheus image, validates the configuration and the rules without starting a server:

```bash
docker run --rm -v "$PWD:/etc/prometheus:ro" --entrypoint promtool \
  prom/prometheus:v3.13.4 check config /etc/prometheus/prometheus.yml
```

Run it from this folder. Prometheus reads the files at startup: after changing them, `docker compose restart prometheus`.
