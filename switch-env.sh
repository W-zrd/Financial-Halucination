#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

selected="${1:-openagentic}"
case "$selected" in
  zai)
    profile="$repo_dir/.env.zai"
    ;;
  openagentic)
    profile="$repo_dir/.env.openagentic"
    ;;
  *)
    printf 'Usage: %s {zai|openagentic}\n' "${0##*/}" >&2
    exit 2
    ;;
esac

install -m 600 "$profile" "$repo_dir/.env"
printf 'Active TradingAgents environment: %s\n' "$selected"
