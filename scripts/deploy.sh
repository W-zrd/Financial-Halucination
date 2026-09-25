#!/usr/bin/env bash
set -Eeuo pipefail
cd "${DEPLOY_DIR:-/opt/tradingagents}"
if [[ -f .env.web ]]; then
  set -a
  source .env.web
  set +a
fi
new_image="${1:?usage: deploy.sh IMAGE}"
old_image="$(docker inspect --format '{{.Config.Image}}' finance-web 2>/dev/null || true)"
rollback() {
  echo "Deployment failed; rolling back to ${old_image:-previous compose image}" >&2
  if [[ -n "$old_image" ]]; then
    TRADINGAGENTS_IMAGE="$old_image" docker compose up -d --no-build finance-web
    ./scripts/container-smoke.sh "${SMOKE_URL:-http://127.0.0.1:8082}"
  fi
}
trap rollback ERR
if ! docker image inspect "$new_image" >/dev/null 2>&1; then
  docker pull "$new_image"
fi
./scripts/prepare-results.sh "$new_image"
TRADINGAGENTS_IMAGE="$new_image" docker compose up -d --no-build finance-web
./scripts/container-smoke.sh "${SMOKE_URL:-http://127.0.0.1:8082}"
trap - ERR
docker image prune -f --filter 'until=168h'
echo "Deployed $new_image"
