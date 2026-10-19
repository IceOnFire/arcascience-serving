#!/usr/bin/env sh
# Generate a random API_KEY and write it to .env (created from .env.example if missing).
# Prints the new key. Restart the server for it to take effect.
#
#   ./generate_key.sh
set -eu

cd "$(dirname "$0")"
umask 077   # a new .env is readable by the owner only

key=$("${PYTHON:-python3}" -c "import secrets; print(secrets.token_urlsafe(24))")

if [ ! -f .env ]; then
    cp .env.example .env
fi

# Replace the API_KEY line, or append one. Written to a temp file and moved,
# because sed -i behaves differently on macOS and Linux.
awk -v key="$key" '
    /^API_KEY=/ { print "API_KEY=" key; found = 1; next }
    { print }
    END { if (!found) print "API_KEY=" key }
' .env > .env.tmp
mv .env.tmp .env

echo "New API_KEY written to .env:"
echo "$key"
