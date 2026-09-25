#!/usr/bin/env bash
set -Eeuo pipefail
base="${1:-http://127.0.0.1:8082}"
for _ in {1..30}; do
  if curl --fail --silent --show-error "$base/api/health" | grep -q '"status":"ok"'; then
    echo "Smoke OK: $base/api/health"
    exit 0
  fi
  sleep 2
done
echo "Smoke failed: $base/api/health" >&2
exit 1
