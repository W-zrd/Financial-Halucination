#!/usr/bin/env bash
set -Eeuo pipefail
image="${1:-${TRADINGAGENTS_IMAGE:-tradingagents-web:local}}"
mkdir -p results
# The runtime is fixed non-root UID/GID 10001. Adjust only the report tree that is
# deliberately bind-mounted; existing report contents are preserved.
docker run --rm --user 0:0 --entrypoint chown -v "$PWD/results:/app/results" "$image" -R 10001:10001 /app/results
echo "Prepared $PWD/results for container UID 10001"
