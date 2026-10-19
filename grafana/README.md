# Grafana

Grafana shows the [Prometheus](../prometheus/README.md) metrics on a dashboard. It runs as its own container in [`docker-compose.yml`](../docker-compose.yml), at http://localhost:3000, and opens directly on the _Endpoint classifier_ dashboard, with no login needed.

## The dashboard

| Row    | Panels                                                                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top    | Model version, predictions in the last hour, share needing review (green, orange above 45%, red above 60%), embedding errors, firing alerts        |
| Middle | Predictions per minute by category; share needing review over time, with dashed lines at 39% (the Part 2 test set) and 60% (the alert threshold)   |
| Bottom | Confidence distribution in the last hour (each bar counts predictions up to its label: below 0.9 needs review); embedding API latency, p50 and p95 |

Each panel has a description: hover over the ⓘ next to its title.

Grafana and the API's [`/stats`](../api/README.md#drift-statistics-stats) answer different questions. Grafana shows the service over time, from Prometheus. Comparing live predictions with the model's baseline needs the baseline and the PSI computation, which only the API has.

## Provisioned from files

Nothing is set up by hand: at startup, Grafana reads

- [`provisioning/datasources/prometheus.yml`](provisioning/datasources/prometheus.yml): the Prometheus data source, at `http://prometheus:9090` on the Compose network;
- [`provisioning/dashboards/dashboards.yml`](provisioning/dashboards/dashboards.yml): where to find dashboards;
- [`dashboards/endpoint-classifier.json`](dashboards/endpoint-classifier.json): the dashboard itself.

So the dashboard is versioned with the code. To change it, edit the JSON and run `docker compose restart grafana`; changes made in the UI can't be saved. The empty `provisioning/plugins/` and `provisioning/alerting/` folders only keep Grafana from logging errors about missing folders.

## Access

Visitors get read-only access without logging in. Editing needs the admin login, `admin`/`admin` by default: acceptable only because every port in [`docker-compose.yml`](../docker-compose.yml) listens on `localhost`.

## How I checked it

Every panel's query was run through Grafana's own API, and the dashboard was rendered with headless Chrome. The screenshots caught what the queries couldn't: a line coloured by thresholds, which made it invisible under 39%; latency lines drawn across periods without traffic; a prediction count shown as 25.6, an effect of Prometheus extrapolation; confidence buckets labelled `+Inf` instead of `≤ 1`.
