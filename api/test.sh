#!/usr/bin/env sh
# Run the test suite (run ./setup.sh once first). No network or API key needed.
#
#   ./test.sh                      # all tests
#   ./test.sh -k stats             # extra arguments go to pytest
#   ./test.sh tests/test_model.py
set -eu

cd "$(dirname "$0")"

if [ ! -x .venv/bin/python ]; then
    echo "Dependencies not installed: run ./setup.sh first." >&2
    exit 1
fi

exec .venv/bin/python -m pytest "$@"
