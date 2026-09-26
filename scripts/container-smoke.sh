#!/usr/bin/env bash
set -Eeuo pipefail
base="${1:-http://127.0.0.1:8082}"
user="${WEB_USERNAME:-smoke}"
password="${WEB_PASSWORD:-smoke-password-change-me}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl --fail --silent --show-error --retry 30 --retry-delay 1 --retry-all-errors -c "$tmp/cookies" -H 'Content-Type: application/json' -d "{\"username\":\"$user\",\"password\":\"$password\"}" "$base/api/auth/login" > "$tmp/login.json"
curl --fail --silent --show-error -b "$tmp/cookies" "$base/api/session" > "$tmp/session.json"
curl --fail --silent --show-error -b "$tmp/cookies" "$base/api/runs" > "$tmp/runs.json"
curl --fail --silent --show-error -b "$tmp/cookies" "$base/api/jobs" > "$tmp/jobs.json"
python3 -c 'import json,sys; assert isinstance(json.load(open(sys.argv[1])), list)' "$tmp/jobs.json"
run_id="$(python3 -c 'import json,sys; runs=json.load(open(sys.argv[1])); assert runs, "no history fixture"; print(runs[0]["id"])' "$tmp/runs.json")"
curl --fail --silent --show-error -b "$tmp/cookies" "$base/api/runs/$run_id" > "$tmp/report.json"
section="$(python3 -c 'import json,sys; report=json.load(open(sys.argv[1])); sections=report.get("sections", {}); assert sections, "no report sections"; print(next(iter(sections)))' "$tmp/report.json")"
curl --fail --silent --show-error -b "$tmp/cookies" "$base/api/runs/$run_id/raw/$section" > "$tmp/raw.md"
test -s "$tmp/raw.md"
curl --fail --silent --show-error -b "$tmp/cookies" -N "$base/api/events" | grep -q '"status":"ready"'
echo "Authenticated container smoke OK (session, history, report, raw, SSE)"
