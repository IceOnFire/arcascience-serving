#!/usr/bin/env sh
# Start the API server. On the first run, also creates .venv and installs dependencies.
#
#   ./run.sh                 # http://127.0.0.1:8000
#   PORT=9000 ./run.sh
#   ./run.sh --reload        # extra arguments go to uvicorn
set -eu

cd "$(dirname "$0")"

if [ ! -x .venv/bin/uvicorn ]; then
    echo "Creating .venv and installing dependencies..."
    "${PYTHON:-python3}" -m venv .venv
    .venv/bin/pip install --quiet -r requirements.txt
fi

if [ ! -f .env ]; then
    echo "Note: no .env file; settings must come from the environment (see .env.example)." >&2
fi

exec .venv/bin/uvicorn app.main:create_app --factory \
    --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}" "$@"
