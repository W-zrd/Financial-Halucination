#!/usr/bin/env bash
set -Eeuo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"

for command in uv npm curl setsid; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Missing required command: $command" >&2
    exit 1
  }
done

[[ -f .env.openagentic ]] || {
  echo "Missing .env.openagentic; copy .env.openagentic.example and add the OpenAgentic credential." >&2
  exit 1
}
[[ -f .env.web ]] || {
  echo "Missing .env.web; copy .env.web.example and set the login credentials." >&2
  exit 1
}
[[ -d .venv ]] || {
  echo "Missing Python environment; run: uv sync --extra dev" >&2
  exit 1
}
[[ -d frontend/node_modules ]] || {
  echo "Missing frontend dependencies; run: cd frontend && npm ci" >&2
  exit 1
}

if [[ -d results && ! -w results ]]; then
  command -v sudo >/dev/null 2>&1 || {
    echo "The results directory is not writable and sudo is unavailable." >&2
    exit 1
  }
  echo "Restoring local ownership of results after Docker use..."
  sudo chown -R "$(id -u):$(id -g)" results
fi

set -a
source .env.openagentic
source .env.web
set +a
export WEB_COOKIE_SECURE=false
export TRADINGAGENTS_RESULTS_DIR="$repo/results"

: "${WEB_USERNAME:?WEB_USERNAME is required in .env.web}"
: "${WEB_PASSWORD:?WEB_PASSWORD is required in .env.web}"
: "${WEB_SESSION_SECRET:?WEB_SESSION_SECRET is required in .env.web}"

if (( ${#WEB_SESSION_SECRET} < 32 )); then
  echo "WEB_SESSION_SECRET must contain at least 32 characters." >&2
  exit 1
fi

backend_pid=""
frontend_pid=""
cleanup() {
  trap - EXIT INT TERM
  [[ -z "$frontend_pid" ]] || kill -- "-$frontend_pid" 2>/dev/null || true
  [[ -z "$frontend_pid" ]] || wait "$frontend_pid" 2>/dev/null || true
  if [[ -n "$backend_pid" ]] && kill -0 "$backend_pid" 2>/dev/null; then
    # Let Uvicorn run FastAPI's shutdown hook first; it terminates analysis
    # children and its multiprocessing resource tracker without leak warnings.
    kill -TERM "$backend_pid" 2>/dev/null || true
    for _ in {1..50}; do
      kill -0 "$backend_pid" 2>/dev/null || break
      sleep 0.1
    done
    kill -- "-$backend_pid" 2>/dev/null || true
  fi
  [[ -z "$backend_pid" ]] || wait "$backend_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

setsid "$repo/.venv/bin/tradingagents-web" &
backend_pid=$!

for _ in {1..30}; do
  if ! kill -0 "$backend_pid" 2>/dev/null; then
    wait "$backend_pid"
  fi
  if curl --fail --silent http://127.0.0.1:8082/api/health >/dev/null; then
    break
  fi
  sleep 0.5
done

curl --fail --silent http://127.0.0.1:8082/api/health >/dev/null || {
  echo "Backend did not become ready on http://127.0.0.1:8082" >&2
  exit 1
}

setsid npm --prefix frontend run dev -- --host 127.0.0.1 --strictPort &
frontend_pid=$!

echo
echo "TradingAgents is running at http://127.0.0.1:5173"
echo "Press Ctrl+C to stop both servers."
echo

wait -n "$backend_pid" "$frontend_pid"
