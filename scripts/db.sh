#!/usr/bin/env bash

set -euo pipefail
set +x

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

[ -f "$ENV_FILE" ] || { echo "✗ $ENV_FILE not found" >&2; exit 1; }

DB_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//")"
[ -n "$DB_URL" ] || { echo "✗ DATABASE_URL not found in $ENV_FILE" >&2; exit 1; }

[ "$#" -le 1 ] || { echo "✗ expected one SQL argument" >&2; exit 1; }

export PGDATABASE="$DB_URL"

if [ "$#" -eq 0 ]; then
    exec psql
fi

exec psql -c "$1"
