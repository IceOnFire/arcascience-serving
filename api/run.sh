#!/usr/bin/env sh
# Start the API server (run ./setup.sh once first).
#
#   ./run.sh                 # http://127.0.0.1:8000
#   PORT=9000 ./run.sh
#   ./run.sh --reload        # extra arguments go to uvicorn
set -eu

cd "$(dirname "$0")"

if [ ! -x .venv/bin/uvicorn ]; then
    echo "Dependencies not installed: run ./setup.sh first." >&2
    exit 1
fi

exec .venv/bin/uvicorn app.main:create_app --factory \
    --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}" "$@"
