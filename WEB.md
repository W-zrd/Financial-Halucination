# Private TradingAgents Web Console

The web console is a login-only React 19/Vite client served by FastAPI. It preserves existing CLI reports under `results/<ticker>/<date>/reports`, scans those legacy runs, and adds `metadata.json` for new web runs. Web analyses always override the library's `~/.tradingagents/logs` default and write to this repository's `results/` tree (the `/app/results` bind mount in Docker). Rollback is file-safe: the web deployment does not migrate or delete old reports.

## CLI discovery

The existing CLI is interactive; it does **not** accept ticker/date as positional flags:

```bash
uv sync --extra dev
uv run tradingagents --help
uv run tradingagents
```

The Typer callback calls `cli.run.run_analysis`, which calls `get_user_selections`. Web execution instead uses the existing programmatic `TradingAgentsGraph.propagate` seam with all four applicable stock analysts. Depth 1/3/5 is applied to both debate and risk discussion rounds. Provider and quick/deep model IDs are fixed by `TRADINGAGENTS_LLM_PROVIDER`, `TRADINGAGENTS_QUICK_THINK_LLM`, and `TRADINGAGENTS_DEEP_THINK_LLM`; output is always English. Each analysis runs in an isolated child process, so two tickers can run concurrently by default without sharing graph state. Set `TRADINGAGENTS_WEB_MAX_CONCURRENT` to a positive integer to change that bound. Stopping a run terminates only its child process.

## Using the research desk

- **New analysis** configures a ticker, date, and depth without interrupting other jobs.
- **Live runs** shows independent status and elapsed time; select a run to inspect its agent activity. **Force stop** terminates that run, not its siblings. It cannot undo charges for provider requests already sent.
- **Analysis dashboard** summarizes the latest completed report per ticker with rating bars, ranked evidence, conditional plans, and a $105 monthly allocation ledger. The ledger holds the full $105 as cash because this view has no verified live quote or complete two-target plan; missing scores, confidence, or targets stay “Not available.” It never retrieves live quotes or launches a paid analysis.
- **Saved reports** groups runs by ticker in alphabetical order; open a ticker to choose a date. Each dated run can be opened or removed from history after confirmation. The underlying files remain on disk with a `.web-hidden` marker in that report directory; an administrator can restore the entry by removing that marker. Saved-report IDs identify a specific on-disk report instance; replacing a report invalidates its old ID. Live job IDs still resolve read-only completion reports, but cannot remove them. The report table of contents links to the available sections, with raw views and downloads retained.
- The desktop navigation stays fixed in view; mobile uses compact workspace navigation. Reloading reconnects to active jobs while the server remains running. Live output is published as graph steps and agent responses complete, not as fabricated progress percentages or private token-by-token reasoning.
- OpenAgentic is the default: both models are `deepseek-v4.1-flash`. Both OpenAgentic and Z.ai profiles set retries to `15`, checkpoints to `true`, and CLI output to `./results`. Run `./switch-env.sh` for the default CLI profile or `./switch-env.sh zai` for Z.ai; the web launcher deliberately uses OpenAgentic.

## Local development

Local dependencies and credentials are already prepared on this machine. Start both FastAPI and Vite with one command:

```bash
./scripts/dev.sh
```

Open `http://127.0.0.1:5173`. Press `Ctrl+C` to stop both servers. The launcher uses `.env.openagentic` as the provider profile, loads `.env.web`, pins `TRADINGAGENTS_RESULTS_DIR` to the repository's `results/` directory, restores local report ownership after Docker use when necessary, forces HTTP-safe local cookies, checks prerequisites and ports, waits for the backend health endpoint, and then starts Vite.

For a fresh checkout, perform the one-time setup first:

```bash
cp .env.openagentic.example .env.openagentic
cp .env.web.example .env.web
# Add the OpenAgentic credential to .env.openagentic and login credentials to .env.web.
uv sync --extra dev
cd frontend && npm ci && cd ..
```

Run verification with:

```bash
uv run pytest tests/test_web_api.py -q
cd frontend && npm test && npm run build
```

Do not start an analysis merely to test deployment: it invokes paid model/data providers. Existing report browsing, auth, downloads, health, and SSE can be tested without it.

## Docker

Create the external reverse-proxy network once, populate `.env.openagentic` (or keep `.env` as a fallback), then start the service:

```bash
docker network inspect wzrd_default >/dev/null 2>&1 || docker network create wzrd_default
docker compose config
docker compose build finance-web
./scripts/prepare-results.sh tradingagents-web:local
docker compose up -d finance-web
./scripts/smoke.sh http://127.0.0.1:8082
```

The container runs as UID/GID 10001 with a read-only root filesystem, all capabilities dropped, `no-new-privileges`, bounded memory/PIDs, and only `127.0.0.1:8082` published. Reports are bind-mounted from `./results`; cache/memory and checkpoints are in `tradingagents_data`. `prepare-results.sh` changes only that report tree's ownership so the non-root worker can create canonical reports; to roll ownership back, run `sudo chown -R <host-uid>:<host-gid> results`.

## DNS and Caddy

Create an `A` record for `finance.rfdhaikal-wizz.com` pointing to the VPS IPv4 address (and an `AAAA` record only if IPv6 is routed and firewalled correctly). Caddy should be attached to `wzrd_default` and proxy the service by container name:

```caddyfile
finance.rfdhaikal-wizz.com {
    encode zstd gzip
    reverse_proxy finance-web:8082
}
```

Only Caddy should publish 80/443. Keep 8082 loopback-only. Confirm provider firewalls permit 80/443 and preserve the SSH port before changing host firewall rules. A local health check does not prove DNS or TLS issuance.

## Deployment and rollback

CI runs backend tests, frontend tests/build, Compose validation, and a Docker build. Main pushes package the tested SHA-tagged image as a one-day GitHub Actions artifact, transfer it over pinned SSH, load it on the VPS, and run:

```bash
DEPLOY_DIR=/opt/tradingagents ./scripts/deploy.sh tradingagents-web:sha-COMMIT
```

Required GitHub repository variables: `DEPLOY_HOST`, `DEPLOY_PORT`, and `DEPLOY_USER`. Required secrets: `DEPLOY_SSH_KEY` and pinned `DEPLOY_KNOWN_HOSTS`. The server must already contain `/opt/tradingagents/.env.openagentic` (preferred; `/opt/tradingagents/.env` remains a fallback) and `/opt/tradingagents/.env.web`, and have the external `wzrd_default` network. The deploy script records the current container image, starts the transferred image, performs a loopback smoke test, and restores the prior image if smoke fails. After DNS and HTTPS are live, set `PUBLIC_SMOKE_ENABLED=true` as a repository variable to enable the public post-deploy check.
