#!/usr/bin/env sh
# Make the monitoring move: send traffic, cause drift, break the embedding API, stop the API.
# Works with the Docker setup (docker compose up). See demo/README.md.
#
#   ./demo.sh traffic [count]   normal mix of endpoints (default 100)
#   ./demo.sh drift [count]     only pharmacokinetic endpoints (default 400)
#   ./demo.sh review [count]    only ambiguous endpoints (default 60)
#   ./demo.sh outage            embedding API unreachable: requests fail with 503
#   ./demo.sh down              stop the API container
#   ./demo.sh restore           back to normal after outage or down
#   ./demo.sh status            /stats summary and Prometheus alerts
set -eu

cd "$(dirname "$0")/.."   # the repository root, where docker-compose.yml is

wait_healthy() {
    printf "waiting for the API"
    for _ in $(seq 60); do
        if curl -sf "http://127.0.0.1:${API_PORT:-8000}/health" >/dev/null; then echo " ready"; return; fi
        printf "."; sleep 1
    done
    echo " timed out"; exit 1
}

case "${1:-}" in
    traffic|drift|review)
        python3 demo/send.py "$@"
        python3 demo/send.py stats
        if [ "$1" = review ]; then
            echo "HighReviewRate goes pending when over 60% of the last hour's predictions (and at least 50) need review."
        fi
        ;;
    outage)
        docker compose -f docker-compose.yml -f demo/outage.yml up -d api
        wait_healthy
        echo "Sending 3 requests; each fails after the client's retries (about 4 s)..."
        python3 demo/send.py traffic 60
        echo "EmbeddingApiFailing fires within a minute, and resolves 5 minutes after the last error."
        echo "Note: /health still answers 200, because it only checks that the process is up."
        ;;
    down)
        docker compose stop api
        echo "ApiDown fires about 1 minute after the last successful scrape."
        ;;
    restore)
        docker compose up -d api
        wait_healthy
        ;;
    status)
        python3 demo/send.py stats
        python3 demo/send.py alerts
        ;;
    *)
        sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
        exit 1
        ;;
esac
