#!/usr/bin/env sh
# One-time setup: create .venv, install dependencies, create .env with a random API_KEY.
# Safe to re-run: it updates dependencies and leaves an existing API_KEY untouched.
#
#   ./setup.sh
#   PYTHON=python3.14 ./setup.sh     # interpreter used to create .venv
set -eu

cd "$(dirname "$0")"

if [ ! -d .venv ]; then
    echo "Creating .venv..."
    "${PYTHON:-python3}" -m venv .venv
fi
echo "Installing dependencies..."
.venv/bin/pip install --quiet --disable-pip-version-check -r requirements.txt

if ! grep -Eq '^API_KEY=.+' .env 2>/dev/null || grep -q '^API_KEY=change-me$' .env; then
    ./generate_key.sh
fi

missing=$(grep -E '^[A-Z_]+=$' .env | cut -d= -f1 || true)
if [ -n "$missing" ]; then
    echo
    echo "Fill in these settings in .env, then start the server with ./run.sh:"
    echo "$missing" | sed 's/^/  /'
else
    echo
    echo "Ready: start the server with ./run.sh"
fi
