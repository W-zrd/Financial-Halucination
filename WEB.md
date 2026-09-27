# Financial Halucination Web Console

Financial Halucination is a login-only React 19/Vite client served by FastAPI. It preserves existing CLI reports under `results/<ticker>/<date>/reports`, scans those legacy runs, and adds `metadata.json` for new web runs. Web analyses always override the library's `~/.tradingagents/logs` default and write to this repository's `results/` tree (the `/app/results` bind mount in Docker). The web deployment does not migrate or delete reports. A confirmed history removal currently hides the selected entry but retains its files.

## CLI discovery

The existing CLI is interactive; it does **not** accept ticker/date as positional flags:

```bash
uv sync --extra dev
uv run tradingagents --help
uv run tradingagents
```

The Typer callback calls `cli.run.run_analysis`, which calls `get_user_selections`. Web execution instead uses the existing programmatic `TradingAgentsGraph.propagate` seam with all four applicable stock analysts. Depth 1/3/5 is applied to both debate and risk discussion rounds. The provider and backend URL remain configured by the server environment. The chosen web model overrides both quick/deep roles for that run without changing another job's configuration; calls without a selection retain the configured defaults. Output is always English. Each analysis runs in an isolated child process, so two tickers can run concurrently by default without sharing graph state. Set `TRADINGAGENTS_WEB_MAX_CONCURRENT` to a positive integer to change that bound. Stopping a run terminates only its child process.

## Using the research desk

- **New analysis** accepts a manually typed ticker, date, depth, and one of the server-listed, case-sensitive LLM model IDs without interrupting other jobs. Clicking anywhere in the date field opens the native picker while keyboard editing remains available. `gemini-3.8-flash-high` is preselected when the server offers it; otherwise the configured model is used only if both roles match an offered ID, and a model must be chosen if neither applies. The selected model is recorded with the job and saved report. Older reports without model metadata say “Not available” rather than attributing an unverified model.
- **Live runs** shows independent status and elapsed time; select a run to inspect its agent activity. **Force stop** terminates that run, not its siblings. It cannot undo charges for provider requests already sent.
- **Analysis dashboard** is the first view after sign-in or session restoration, with a highlighted navigation entry. It shows a prominent allocation ring, rating-count chart, a compact, four-series Buy/Hold/Sell/Unknown count line chart by the analysis date chosen when each run was started (select a date to inspect the contributing tickers and open their reports), compact conditional target cards, a no-new-capital watchlist, ranked evidence, and an exact $105 monthly ledger. Each date counts the latest completed saved decision per ticker/date once (including unknown ratings); dates with no saved analyses are not invented. The proposal earmarks up to $75 for the latest positive saved decisions (Buy weighted 3, Overweight 2), capped at $50 per name; the remainder is cash. With no saved reports, the full $105 remains cash until a new completed analysis supplies a supported final rating. These are **proposed monthly dollar targets**, not current holdings, executable orders, or share quantities. Check actual holdings, current quotes, the reports’ conditions, and fractional-share availability before trading. Hold, Underweight, inconclusive, or missing decisions receive no new-money target. Missing scores, confidence, targets, and risk dollars remain “Not available.” The dashboard never retrieves live quotes or launches a paid analysis.
- **Saved reports** is a separate, bounded tracking workspace, not an expanding list in the navigation rail. It shows saved-run, ticker, and distinct-analysis-date totals. Choose one ticker from the alphabetical strip to see its exact saved-rating count bars and eight dated runs per page, ordered by analysis date and creation time; same-date reruns are distinguished by timestamp (or run ID when absent). The ticker strip stays visible while scrolling the library. Opening a run switches to a dedicated reader with a sticky Back action and a direct ticker switch, rather than stacking the whole report below the library. At the top of a report, source-backed bullish/bearish scenario lanes (not probabilities) and a scored sentiment bar appear only when the fields are explicitly present; legacy `overall_band`/`overall_score` lines and the newer single-line sentiment header both work. Future market reports request evidence-backed scenario headings, but missing or unsupported scenarios stay “Not available.” The trash-icon action removes a dated run from history after confirmation. **It does not delete the underlying files**: a `.web-hidden` marker in that report directory hides the entry, and an administrator can restore it by removing that marker. Saved-report IDs identify a specific on-disk report instance; replacing a report invalidates its old ID. Live job IDs still resolve read-only completion reports, but cannot remove them. The report table of contents links to the available sections, with raw views and downloads retained.
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
