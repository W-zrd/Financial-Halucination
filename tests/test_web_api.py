from __future__ import annotations

import json
import shutil
import threading
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tradingagents.web.app import create_app
from tradingagents.web.runs import (
    AnalysisRequest,
    RunManager,
    delete_run,
    execute_analysis,
    scan_runs,
)


def _client(tmp_path: Path, monkeypatch, executor=None) -> TestClient:
    monkeypatch.setenv("WEB_USERNAME", "analyst")
    monkeypatch.setenv("WEB_PASSWORD", "correct horse battery staple")
    monkeypatch.setenv("WEB_SESSION_SECRET", "s" * 32)
    monkeypatch.setenv("WEB_ENV", "test")
    monkeypatch.setenv("WEB_COOKIE_SECURE", "false")
    monkeypatch.setenv("TRADINGAGENTS_RESULTS_DIR", str(tmp_path / "results"))
    return TestClient(create_app(results_dir=tmp_path / "results", executor=executor))


def _login(client: TestClient):
    response = client.post("/api/auth/login", json={"username": "analyst", "password": "correct horse battery staple"})
    assert response.status_code == 200
    assert response.cookies.get("ta_session")
    return response.json()["csrf_token"]


def test_login_session_csrf_and_logout(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        assert client.get("/api/session").status_code == 401
        assert client.post("/api/auth/login", json={"username": "analyst", "password": "wrong"}).status_code == 401
        csrf = _login(client)
        assert client.get("/api/session").json()["username"] == "analyst"
        assert client.post("/api/auth/logout").status_code == 403
        assert client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf}).status_code == 204
        assert client.get("/api/session").status_code == 401


def test_history_scans_legacy_reports_and_never_invents_metadata(tmp_path, monkeypatch):
    report_dir = tmp_path / "results" / "AMD" / "2026-09-24" / "reports"
    report_dir.mkdir(parents=True)
    (report_dir / "final_trade_decision.md").write_text("Rating: Buy\n\nEvidence.", encoding="utf-8")
    (report_dir / "market_report.md").write_text("# Market\nSafe <script>alert(1)</script>", encoding="utf-8")

    runs = scan_runs(tmp_path / "results")
    assert runs[0]["ticker"] == "AMD"
    assert runs[0]["rating"] == "Buy"
    assert runs[0]["depth"] == "Not available"

    with _client(tmp_path, monkeypatch) as client:
        _login(client)
        history = client.get("/api/runs").json()
        run_id = history[0]["id"]
        report = client.get(f"/api/runs/{run_id}").json()
        assert report["sections"]["market_report"].startswith("# Market")
        raw = client.get(f"/api/runs/{run_id}/raw/market_report")
        assert raw.headers["content-type"].startswith("text/markdown")
        assert raw.text.endswith("</script>")
        download = client.get(f"/api/runs/{run_id}/download/market_report")
        assert "attachment" in download.headers["content-disposition"]
        assert client.get(f"/api/runs/{run_id}/raw/../../.env").status_code in (404, 422)


def test_remove_run_requires_csrf_and_preserves_files_and_sibling_dates(tmp_path, monkeypatch):
    results = tmp_path / "results"
    for analysis_date in ("2026-09-23", "2026-09-24"):
        report_dir = results / "AMD" / analysis_date / "reports"
        report_dir.mkdir(parents=True)
        (report_dir / "final_trade_decision.md").write_text("Rating: Hold", encoding="utf-8")

    with _client(tmp_path, monkeypatch) as client:
        csrf = _login(client)
        history = client.get("/api/runs").json()
        target = next(run for run in history if run["analysis_date"] == "2026-09-24")

        assert client.delete(f"/api/runs/{target['id']}").status_code == 403
        response = client.delete(
            f"/api/runs/{target['id']}", headers={"X-CSRF-Token": csrf}
        )

        assert response.status_code == 204
        assert (results / "AMD" / "2026-09-24" / "reports" / "final_trade_decision.md").exists()
        assert (results / "AMD" / "2026-09-24" / "reports" / ".web-hidden").is_file()
        assert (results / "AMD" / "2026-09-23" / "reports").is_dir()
        assert [run["analysis_date"] for run in client.get("/api/runs").json()] == [
            "2026-09-23"
        ]
        assert client.delete(
            f"/api/runs/{target['id']}", headers={"X-CSRF-Token": csrf}
        ).status_code == 404


def test_delete_programmatic_report_named_reports_preserves_siblings(tmp_path, monkeypatch):
    root = tmp_path / "results"
    for name in ("reports", "AMD_20260924_120000"):
        report_dir = root / "reports" / name
        report_dir.mkdir(parents=True)
        (report_dir / "complete_report.md").write_text("# Report", encoding="utf-8")
    with _client(tmp_path, monkeypatch) as client:
        csrf = _login(client)
        history = client.get("/api/runs").json()
        target = next(run for run in history if run["id"] == next(
            item["id"] for item in scan_runs(root) if item["report_dir"] == str(root / "reports" / "reports")
        ))
        assert client.delete(f"/api/runs/{target['id']}", headers={"X-CSRF-Token": csrf}).status_code == 204
        assert (root / "reports" / "reports" / "complete_report.md").exists()
        assert (root / "reports" / "AMD_20260924_120000" / "complete_report.md").exists()


def test_copied_metadata_ids_do_not_alias_saved_runs(tmp_path, monkeypatch):
    root = tmp_path / "results"
    for ticker in ("AAA", "BBB"):
        report_dir = root / ticker / "2026-09-24" / "reports"
        report_dir.mkdir(parents=True)
        (report_dir / "final_trade_decision.md").write_text("Rating: Hold", encoding="utf-8")
        (report_dir.parent / "metadata.json").write_text('{"id":"copied-id"}', encoding="utf-8")
    with _client(tmp_path, monkeypatch) as client:
        csrf = _login(client)
        runs = client.get("/api/runs").json()
        assert len({item["id"] for item in runs}) == 2
        target = next(item for item in runs if item["ticker"] == "AAA")
        assert client.delete(f"/api/runs/{target['id']}", headers={"X-CSRF-Token": csrf}).status_code == 204
        assert (root / "BBB" / "2026-09-24" / "reports").exists()


def test_history_ignores_symlinked_report_aliases(tmp_path):
    results = tmp_path / "results"
    victim = results / "ZZZ" / "2026-09-24" / "reports"
    victim.mkdir(parents=True)
    (victim / "final_trade_decision.md").write_text("Rating: Hold", encoding="utf-8")
    alias = results / "AAA" / "2026-09-24" / "reports"
    alias.parent.mkdir(parents=True)
    alias.symlink_to(victim, target_is_directory=True)

    runs = scan_runs(results)

    assert [(run["ticker"], run["analysis_date"]) for run in runs] == [
        ("ZZZ", "2026-09-24")
    ]


def test_overview_uses_latest_saved_decision_and_keeps_unverified_budget_in_cash(tmp_path, monkeypatch):
    root = tmp_path / "results"
    fixtures = [
        ("AMD", "2026-09-23", "Buy", "**Entry Price**: 549 — 10 EMA pullback\n**Stop Loss**: 523 — 1x ATR below structure"),
        ("AMD", "2026-09-24", "Hold", "**Entry Price**: not provided\n**Stop Loss**: not provided"),
        ("MU", "2026-09-24", "Buy", "**Entry Price**: 1040 — pullback to 10 EMA\n**Stop Loss**: 950 — below 50 SMA"),
        ("AAPL", "2026-09-24", "Underweight", "**Entry Price**: 202 — trim\n**Stop Loss**: 205 — re-evaluation, not a long stop"),
    ]
    for ticker, day, rating, plan in fixtures:
        report_dir = root / ticker / day / "reports"
        report_dir.mkdir(parents=True)
        (report_dir / "final_trade_decision.md").write_text(f"**Rating**: {rating}\n**Time Horizon**: 6-12 months", encoding="utf-8")
        (report_dir / "trader_investment_plan.md").write_text(plan, encoding="utf-8")

    with _client(tmp_path, monkeypatch) as client:
        assert client.get("/api/overview").status_code == 401
        _login(client)
        overview = client.get("/api/overview")
        assert overview.status_code == 200
        body = overview.json()
        assert body["counts"] == {"buy": 1, "hold": 1, "sell": 1, "unknown": 0}
        assert [row["ticker"] for row in body["rows"]] == ["MU", "AMD", "AAPL"]
        assert body["budget"] == 105 and body["cash"] == 105
        assert sum(row["allocation"] for row in body["rows"]) + body["cash"] == body["budget"]
        mu = body["rows"][0]
        assert mu["action"] == "WAIT FOR PULLBACK"
        assert mu["entry"].startswith("$1,040")
        assert mu["tp1"] == mu["tp2"] == mu["risk_reward"] == "Not available"
        assert mu["score"] is None and mu["confidence"] == "Not available"
        assert mu["allocation"] == 0 and mu["risk_dollars"] is None
        assert body["rows"][1]["rating"] == "Hold"
        assert body["rows"][2]["stop_loss"] == "Not available"


def test_overview_empty_history_is_cash_only(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        _login(client)
        body = client.get("/api/overview").json()
        assert body["rows"] == []
        assert body["cash"] == body["budget"] == 105
        assert body["counts"] == {"buy": 0, "hold": 0, "sell": 0, "unknown": 0}


def test_overview_calculates_only_sourced_protective_levels(tmp_path, monkeypatch):
    root = tmp_path / "results" / "MU" / "2026-09-24" / "reports"
    root.mkdir(parents=True)
    (root / "final_trade_decision.md").write_text("**Rating**: Buy", encoding="utf-8")
    (root / "trader_investment_plan.md").write_text(
        "**Entry Price**: 100 — support retest\n"
        "**Stop Loss**: 90 — below 50 SMA\n"
        "**TP1**: 110\n**TP2**: 120\n"
        "**Invalidation**: Earnings show a sustained margin decline.\n",
        encoding="utf-8",
    )
    with _client(tmp_path, monkeypatch) as client:
        _login(client)
        row = client.get("/api/overview").json()["rows"][0]
        assert row["entry"].startswith("$100.00")
        assert row["stop_distance_pct"] == 10
        assert row["tp1"] == "$110.00" and row["tp2"] == "$120.00"
        assert row["risk_reward"] == "2.00:1"
        assert row["invalidation"] == "Earnings show a sustained margin decline."
        assert row["risk_dollars"] is None and row["allocation"] == 0


def test_overview_prefers_final_decision_over_stale_snapshot_rating(tmp_path, monkeypatch):
    root = tmp_path / 'results' / '.web-runs' / 'job-1'
    (root / 'reports').mkdir(parents=True)
    (root / 'reports' / 'final_trade_decision.md').write_text('**Rating**: Sell')
    (root / 'metadata.json').write_text('{"id":"job-1","ticker":"AMD","analysis_date":"2026-09-24","status":"done","rating":"Buy"}')
    with _client(tmp_path, monkeypatch) as client:
        _login(client)
        row = client.get('/api/overview').json()['rows'][0]
        assert row['rating'] == 'Sell'
        assert row['action'] == 'AVOID NEW BUY'
        assert client.get('/api/runs').json()[0]['rating'] == 'Sell'
        assert client.get('/api/runs/job-1').json()['rating'] == 'Sell'


def test_inconclusive_final_decision_does_not_inherit_metadata_rating(tmp_path, monkeypatch):
    root = tmp_path / 'results' / '.web-runs' / 'job-1'
    (root / 'reports').mkdir(parents=True)
    (root / 'reports' / 'final_trade_decision.md').write_text('Decision pending verification.')
    (root / 'metadata.json').write_text('{"id":"job-1","ticker":"AMD","analysis_date":"2026-09-24","status":"done","rating":"Buy"}')
    with _client(tmp_path, monkeypatch) as client:
        _login(client)
        overview = client.get('/api/overview').json()
        assert overview['counts'] == {'buy': 0, 'hold': 0, 'sell': 0, 'unknown': 1}
        assert overview['rows'][0]['rating'] == 'Not available'
        assert overview['rows'][0]['action'] == 'REVIEW'
        assert client.get('/api/runs').json()[0]['rating'] == 'Not available'
        assert client.get('/api/runs/job-1').json()['rating'] == 'Not available'


def test_duplicate_metadata_id_cannot_collide_with_another_path_id(tmp_path):
    from tradingagents.web.runs import _run_id, delete_run, scan_runs

    root = tmp_path / 'results'
    reports = [root / symbol / '2026-09-24' / 'reports' for symbol in ('AAA', 'BBB', 'CCC')]
    for report_dir in reports:
        report_dir.mkdir(parents=True)
        (report_dir / 'final_trade_decision.md').write_text('Rating: Hold')
    alias = _run_id(reports[0])
    for report_dir, value in zip(reports, ('copied-id', 'copied-id', alias), strict=True):
        (report_dir.parent / 'metadata.json').write_text(json.dumps({'id': value, 'status': 'done'}))
    discovered = scan_runs(root)
    assert len({run['id'] for run in discovered}) == len(discovered)
    owner = next(run for run in discovered if run['ticker'] == 'AAA')
    assert delete_run(root, owner['id'])
    assert (reports[0] / "final_trade_decision.md").exists()
    assert (reports[0] / ".web-hidden").is_file()
    assert reports[1].exists() and reports[2].exists()


def test_saved_run_identity_never_transfers_to_a_different_report(tmp_path):
    from tradingagents.web.runs import delete_run, find_run, scan_runs

    root = tmp_path / 'results'
    first = root / 'AAA' / '2026-09-24' / 'reports'
    second = root / 'BBB' / '2026-09-24' / 'reports'
    first.mkdir(parents=True)
    (first / 'final_trade_decision.md').write_text('Rating: Hold')
    (first.parent / 'metadata.json').write_text('{"id":"copied-id"}')
    original_id = scan_runs(root)[0]['id']
    second.mkdir(parents=True)
    (second / 'final_trade_decision.md').write_text('Rating: Hold')
    (second.parent / 'metadata.json').write_text('{"id":"copied-id"}')
    assert next(run for run in scan_runs(root) if run['ticker'] == 'AAA')['id'] == original_id
    assert delete_run(root, original_id)
    assert first.exists() and second.exists()
    assert find_run(root, original_id) is None
    assert delete_run(root, original_id) is False
    assert second.exists()


def test_recreating_a_report_at_the_same_path_rejects_stale_delete(tmp_path):
    root = tmp_path / 'results'
    report_dir = root / 'AMD' / '2026-09-24' / 'reports'
    report_dir.mkdir(parents=True)
    (report_dir / 'final_trade_decision.md').write_text('Rating: Hold')
    old_id = scan_runs(root)[0]['id']
    shutil.rmtree(report_dir.parent)
    report_dir.mkdir(parents=True)
    (report_dir / 'final_trade_decision.md').write_text('Rating: Hold')
    assert scan_runs(root)[0]['id'] != old_id
    assert delete_run(root, old_id) is False
    assert report_dir.exists()


def test_stale_report_lookup_does_not_read_replacement_contents(tmp_path, monkeypatch):
    import tradingagents.web.runs as web_runs

    root = tmp_path / 'results'
    report_dir = root / 'AMD' / '2026-09-24' / 'reports'
    report_dir.mkdir(parents=True)
    (report_dir / 'final_trade_decision.md').write_text('Rating: Hold')
    old_id = scan_runs(root)[0]['id']
    old_run = web_runs.find_run(root, old_id)
    assert old_run is not None
    shutil.rmtree(report_dir.parent)
    report_dir.mkdir(parents=True)
    (report_dir / 'final_trade_decision.md').write_text('Rating: Buy')
    monkeypatch.setattr(web_runs, 'find_run', lambda *_: dict(old_run))

    assert web_runs.read_run(root, old_id) is None
    assert web_runs.report_file(root, old_id, 'final_trade_decision') is None


def test_hidden_report_replacement_is_visible_as_a_new_instance(tmp_path):
    root = tmp_path / 'results'
    report_dir = root / 'AMD' / '2026-09-24' / 'reports'
    report_dir.mkdir(parents=True)
    (report_dir / 'final_trade_decision.md').write_text('Rating: Hold')
    old_id = scan_runs(root)[0]['id']
    assert delete_run(root, old_id)
    assert scan_runs(root) == []
    assert (report_dir / 'final_trade_decision.md').exists()
    shutil.rmtree(report_dir.parent)
    report_dir.mkdir(parents=True)
    (report_dir / 'final_trade_decision.md').write_text('Rating: Hold')
    assert len(scan_runs(root)) == 1
    assert scan_runs(root)[0]['id'] != old_id


def test_explicit_leading_final_verdict_counts_in_rating_chart(tmp_path):
    root = tmp_path / 'results' / 'PANW' / '2026-09-24' / 'reports'
    root.mkdir(parents=True)
    (root / 'final_trade_decision.md').write_text('**Hold**\n\nResearch view:\nRating: Buy\n\nThe final rating on `PANW` is **Hold** — no new capital.')
    assert scan_runs(tmp_path / 'results')[0]['rating'] == 'Hold'


def test_bold_rating_label_and_later_final_rating_are_parsed(tmp_path):
    root = tmp_path / 'results'
    for ticker, decision in [
        ('AMD', '**Rating:** Buy'),
        ('TSM', 'Rating: Buy\nFinal Rating: Sell'),
    ]:
        reports = root / ticker / '2026-09-24' / 'reports'
        reports.mkdir(parents=True)
        (reports / 'final_trade_decision.md').write_text(decision)
    ratings = {run['ticker']: run['rating'] for run in scan_runs(root)}
    assert ratings == {'AMD': 'Buy', 'TSM': 'Sell'}


def test_unlabelled_hypothesis_is_not_a_final_recommendation(tmp_path):
    root = tmp_path / 'results' / 'AMD' / '2026-09-24' / 'reports'
    root.mkdir(parents=True)
    (root / 'final_trade_decision.md').write_text('Buy is plausible if conditions improve; no decision yet.')
    assert scan_runs(tmp_path / 'results')[0]['rating'] == 'Not available'


def test_replacing_a_web_snapshot_rejects_stale_job_id_delete(tmp_path, monkeypatch):
    root = tmp_path / 'results'
    report_dir = root / '.web-runs' / 'job-1' / 'reports'
    report_dir.mkdir(parents=True)
    (report_dir / 'final_trade_decision.md').write_text('Rating: Hold')
    (report_dir.parent / 'metadata.json').write_text('{"id":"job-1","ticker":"AMD","analysis_date":"2026-09-24","status":"done"}')
    old_id = scan_runs(root)[0]['id']
    shutil.rmtree(report_dir.parent)
    report_dir.mkdir(parents=True)
    (report_dir / 'final_trade_decision.md').write_text('Rating: Hold')
    (report_dir.parent / 'metadata.json').write_text('{"id":"job-1","ticker":"AMD","analysis_date":"2026-09-24","status":"done"}')
    assert scan_runs(root)[0]['id'] != old_id
    assert delete_run(root, old_id) is False
    assert delete_run(root, 'job-1') is False
    assert report_dir.exists()
    with _client(tmp_path, monkeypatch) as client:
        _login(client)
        assert client.get('/api/runs/job-1').json()['id'] == scan_runs(root)[0]['id']


def test_consolidated_discussion_is_not_a_final_rating(tmp_path, monkeypatch):
    root = tmp_path / 'results' / 'reports' / 'MU_20260924_120000'
    root.mkdir(parents=True)
    (root / 'complete_report.md').write_text('Research analyst: Buy is plausible. No final decision.')
    with _client(tmp_path, monkeypatch) as client:
        _login(client)
        assert client.get('/api/runs').json()[0]['rating'] == 'Not available'
        overview = client.get('/api/overview').json()
        assert overview['counts'] == {'buy': 0, 'hold': 0, 'sell': 0, 'unknown': 1}
        assert overview['rows'][0]['rating'] == 'Not available'
        assert overview['rows'][0]['action'] == 'REVIEW'


def test_overview_includes_programmatic_portfolio_and_trader_sections(tmp_path, monkeypatch):
    report_dir = tmp_path / 'results' / 'reports' / 'MU_20260924_120000'
    report_dir.mkdir(parents=True)
    (report_dir / 'complete_report.md').write_text('# Complete report')
    (report_dir / '5_portfolio_decision.md').write_text('**Rating**: Buy\n**Time Horizon**: 3 months')
    (report_dir / '3_trading_trader.md').write_text('**Entry Price**: $100 — pullback\n**Stop Loss**: $90 — below 50 SMA')
    with _client(tmp_path, monkeypatch) as client:
        _login(client)
        rows = client.get('/api/overview').json()['rows']
        assert len(rows) == 1
        assert rows[0]['rating'] == 'Buy'
        assert rows[0]['entry'].startswith('$100.00')
        assert rows[0]['stop_distance_pct'] == 10


def test_overview_does_not_read_symlinked_metadata(tmp_path):
    root = tmp_path / 'results'
    report_dir = root / 'AMD' / '2026-09-24' / 'reports'
    report_dir.mkdir(parents=True)
    (report_dir / 'final_trade_decision.md').write_text('**Rating**: Hold')
    outside = tmp_path / 'outside.json'
    outside.write_text('{"ticker":"SECRET","rating":"Buy"}')
    (report_dir.parent / 'metadata.json').symlink_to(outside)
    from tradingagents.web.runs import scan_runs
    assert scan_runs(root)[0]['ticker'] == 'AMD'


def test_two_runs_execute_concurrently_and_sse_reports_done(tmp_path, monkeypatch):
    gate = tmp_path / "release"

    def fake_executor(request, results_dir, emit):
        (tmp_path / f"started-{request.ticker}").write_text("started", encoding="utf-8")
        emit("analysis", f"{request.ticker} generating report")
        while not gate.exists():
            time.sleep(0.01)
        target = results_dir / request.ticker / request.analysis_date / "reports"
        target.mkdir(parents=True, exist_ok=True)
        (target / "final_trade_decision.md").write_text("Rating: Hold", encoding="utf-8")
        return target.parent

    with _client(tmp_path, monkeypatch, fake_executor) as client:
        csrf = _login(client)
        headers = {"X-CSRF-Token": csrf}
        first = client.post("/api/runs", headers=headers, json={"ticker": "AMD", "analysis_date": "2026-09-24", "depth": 1})
        second = client.post("/api/runs", headers=headers, json={"ticker": "MU", "analysis_date": "2026-09-24", "depth": 3})
        assert first.status_code == second.status_code == 202
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline and not all((tmp_path / f"started-{ticker}").exists() for ticker in ("AMD", "MU")):
            time.sleep(0.01)
        both_started = all((tmp_path / f"started-{ticker}").exists() for ticker in ("AMD", "MU"))
        gate.touch()
        assert both_started
        run_id = second.json()["id"]
        with client.stream("GET", f"/api/runs/{run_id}/events") as response:
            body = "".join(response.iter_text())
        assert '"status":"done"' in body


def test_running_analysis_can_be_force_stopped(tmp_path, monkeypatch):
    def blocking_executor(request, results_dir, emit):
        emit("analysis", "Waiting forever")
        while True:
            time.sleep(0.05)

    with _client(tmp_path, monkeypatch, blocking_executor) as client:
        csrf = _login(client)
        headers = {"X-CSRF-Token": csrf}
        response = client.post(
            "/api/runs",
            headers=headers,
            json={"ticker": "AMD", "analysis_date": "2026-09-24", "depth": 1},
        )
        job_id = response.json()["id"]
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline and client.get(f"/api/jobs/{job_id}").json()["status"] != "running":
            time.sleep(0.01)

        assert client.post(f"/api/jobs/{job_id}/cancel").status_code == 403
        stopped = client.post(f"/api/jobs/{job_id}/cancel", headers=headers)
        assert stopped.status_code == 202
        assert stopped.json()["status"] == "cancelled"
        with client.stream("GET", f"/api/runs/{job_id}/events") as events:
            body = "".join(events.iter_text())
        assert '"status":"cancelled"' in body


def test_queued_analysis_can_be_cancelled(tmp_path, monkeypatch):
    gate = tmp_path / "release"

    def blocking_executor(request, results_dir, emit):
        while not gate.exists():
            time.sleep(0.01)
        target = results_dir / request.ticker / request.analysis_date / "reports"
        target.mkdir(parents=True, exist_ok=True)
        (target / "final_trade_decision.md").write_text("Rating: Hold", encoding="utf-8")
        return target.parent

    monkeypatch.setenv("TRADINGAGENTS_WEB_MAX_CONCURRENT", "1")
    with _client(tmp_path, monkeypatch, blocking_executor) as client:
        csrf = _login(client)
        headers = {"X-CSRF-Token": csrf}
        client.post("/api/runs", headers=headers, json={"ticker": "AMD", "analysis_date": "2026-09-24", "depth": 1})
        queued = client.post("/api/runs", headers=headers, json={"ticker": "MU", "analysis_date": "2026-09-24", "depth": 1}).json()
        stopped = client.post(f"/api/jobs/{queued['id']}/cancel", headers=headers)
        assert stopped.status_code == 202
        assert stopped.json()["status"] == "cancelled"
        gate.touch()


def test_duplicate_inflight_target_is_rejected(tmp_path, monkeypatch):
    gate = tmp_path / "release"

    def blocking_executor(request, results_dir, emit):
        while not gate.exists():
            time.sleep(0.01)
        target = results_dir / request.ticker / request.analysis_date / "reports"
        target.mkdir(parents=True, exist_ok=True)
        (target / "final_trade_decision.md").write_text("Rating: Hold", encoding="utf-8")

    with _client(tmp_path, monkeypatch, blocking_executor) as client:
        csrf = _login(client)
        headers = {"X-CSRF-Token": csrf}
        payload = {"ticker": "AMD", "analysis_date": "2026-09-24", "depth": 1}
        assert client.post("/api/runs", headers=headers, json=payload).status_code == 202
        duplicate = client.post("/api/runs", headers=headers, json=payload)
        gate.touch()

        assert duplicate.status_code == 409


def test_jobs_list_rediscovers_active_analysis(tmp_path, monkeypatch):
    gate = tmp_path / "release"

    def blocking_executor(request, results_dir, emit):
        while not gate.exists():
            time.sleep(0.01)
        target = results_dir / request.ticker / request.analysis_date / "reports"
        target.mkdir(parents=True, exist_ok=True)
        (target / "final_trade_decision.md").write_text("Rating: Hold", encoding="utf-8")

    with _client(tmp_path, monkeypatch, blocking_executor) as client:
        csrf = _login(client)
        created = client.post(
            "/api/runs",
            headers={"X-CSRF-Token": csrf},
            json={"ticker": "AMD", "analysis_date": "2026-09-24", "depth": 1},
        ).json()

        jobs = client.get("/api/jobs")
        gate.touch()

        assert jobs.status_code == 200
        assert any(job["id"] == created["id"] for job in jobs.json())


def test_analysis_config_is_env_fixed_english_and_depth_controls_both_rounds(tmp_path, monkeypatch):
    monkeypatch.setenv("TRADINGAGENTS_LLM_PROVIDER", "openai")
    monkeypatch.setenv("TRADINGAGENTS_QUICK_THINK_LLM", "quick-fixed")
    monkeypatch.setenv("TRADINGAGENTS_DEEP_THINK_LLM", "deep-fixed")
    monkeypatch.setenv("TRADINGAGENTS_LLM_MAX_RETRIES", "15")
    monkeypatch.setenv("TRADINGAGENTS_CHECKPOINT_ENABLED", "true")
    captured = {}

    class FakeGraph:
        def __init__(self, analysts, config, debug):
            captured.update(config=config, analysts=analysts, debug=debug)
        def propagate(self, ticker, analysis_date, asset_type="stock", on_chunk=None):
            captured["asset_type"] = asset_type
            assert on_chunk is not None
            on_chunk({"messages": [type("Message", (), {"content": "Bull and bear agents are discussing AMD", "id": "message-1"})()]})
            debate = {"investment_debate_state": {"current_response": "Valuation supports upside"}}
            on_chunk(debate)
            on_chunk(debate)
            on_chunk({"risk_debate_state": {
                "current_aggressive_response": "Take the opportunity",
                "judge_decision": "Keep position sizing disciplined",
            }})
            return {"final_trade_decision": "Rating: Overweight"}, "Overweight"

    request = AnalysisRequest(ticker="AMD", analysis_date="2026-09-24", depth=5)
    emitted = []
    execute_analysis(request, tmp_path, lambda kind, message: emitted.append((kind, message)), graph_factory=FakeGraph)
    assert captured["analysts"] == ["market", "social", "news", "fundamentals"]
    assert captured["asset_type"] == "stock"
    assert captured["config"]["max_debate_rounds"] == 5
    assert captured["config"]["max_risk_discuss_rounds"] == 5
    assert captured["config"]["output_language"] == "English"
    assert captured["config"]["results_dir"] == str(tmp_path)
    assert captured["config"]["quick_think_llm"] == "quick-fixed"
    assert captured["config"]["llm_max_retries"] == 15
    assert captured["config"]["checkpoint_enabled"] is True
    assert ("agent", "Bull and bear agents are discussing AMD") in emitted
    assert emitted.count(("agent", "Research debate: Valuation supports upside")) == 1
    assert ("agent", "Aggressive risk analyst: Take the opportunity") in emitted
    assert ("agent", "Portfolio manager: Keep position sizing disciplined") in emitted


def test_crypto_run_omits_fundamentals_and_propagates_asset_type(tmp_path):
    captured = {}

    class FakeGraph:
        def __init__(self, analysts, config, debug):
            captured["analysts"] = analysts

        def propagate(self, ticker, analysis_date, asset_type="stock", on_chunk=None):
            captured["asset_type"] = asset_type
            return {"final_trade_decision": "Rating: Hold"}, "Hold"

    request = AnalysisRequest(ticker="BTC-USD", analysis_date="2026-09-24", depth=1)
    execute_analysis(request, tmp_path, lambda *_: None, graph_factory=FakeGraph)

    assert captured["analysts"] == ["market", "social", "news"]
    assert captured["asset_type"] == "crypto"


def _request(ticker="AMD"):
    return AnalysisRequest(ticker=ticker, analysis_date="2026-09-24", depth=1)


def _write_result(request, results_dir, emit):
    target = results_dir / request.ticker / request.analysis_date / "reports"
    target.mkdir(parents=True, exist_ok=True)
    (target / "final_trade_decision.md").write_text("Rating: Hold")


@pytest.mark.parametrize("boundary", ["construct", "start"])
def test_startup_failure_does_not_kill_scheduler(tmp_path, monkeypatch, boundary):
    manager = RunManager(tmp_path, executor=_write_result)
    real_process = manager._context.Process
    calls = 0

    def process_factory(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            if boundary == "construct":
                raise OSError("spawn unavailable")
            process = real_process(*args, **kwargs)
            monkeypatch.setattr(process, "start", lambda: (_ for _ in ()).throw(OSError("spawn unavailable")))
            return process
        return real_process(*args, **kwargs)

    monkeypatch.setattr(manager._context, "Process", process_factory)
    first = manager.submit(_request())
    second = manager.submit(_request("MU"))
    manager.start()
    try:
        assert first.finished.wait(5)
        assert first.status == "failed"
        assert "spawn unavailable" in first.error
        assert second.finished.wait(5)
        assert second.status == "done"
        assert manager._thread.is_alive()
        assert not manager._processes
    finally:
        manager.stop()


@pytest.mark.parametrize("boundary", ["construct", "start"])
def test_cancel_is_atomic_with_launch_and_reaps_process(tmp_path, monkeypatch, boundary):
    entered = threading.Event()
    release = threading.Event()
    cancel_attempted = threading.Event()
    processes = []

    def blocking_executor(*args):
        while True:
            time.sleep(0.01)

    manager = RunManager(tmp_path, executor=blocking_executor)
    real_process = manager._context.Process

    def factory(*args, **kwargs):
        if boundary == "construct":
            entered.set()
            assert release.wait(5)
        process = real_process(*args, **kwargs)
        processes.append(process)
        real_start = process.start

        def start():
            if boundary == "start":
                entered.set()
                assert release.wait(5)
            real_start()

        monkeypatch.setattr(process, "start", start)
        return process

    monkeypatch.setattr(manager._context, "Process", factory)
    job = manager.submit(_request())
    manager.start()

    def cancel():
        cancel_attempted.set()
        manager.cancel(job.id)

    canceller = threading.Thread(target=cancel)
    try:
        assert entered.wait(5)
        canceller.start()
        assert cancel_attempted.wait(5)
        # Cancellation must wait for the atomic launch transition, not finish
        # before a process which it cannot see is started.
        cancelled_during_launch = job.finished.wait(0.1)
        release.set()
        canceller.join(5)
        assert not cancelled_during_launch
        assert job.finished.wait(5)
        assert job.status == "cancelled"
        assert not manager._processes
        assert all(process._closed for process in processes)
    finally:
        release.set()
        manager.stop()
        canceller.join(5)
        for process in processes:
            if not process._closed:
                if process.is_alive():
                    process.kill()
                process.join()
                process.close()


def _spawn_noisy_executor(request, results_dir, emit):
    root = results_dir.parents[1]
    if request.ticker == "AMD":
        (root / "noisy-started").touch()
        while True:
            emit("agent", "discussion " * 100000)
    while not (root / "release-sibling").exists():
        time.sleep(0.01)
    emit("agent", "Sibling discussion")
    _write_result(request, results_dir, emit)


def test_spawn_noisy_writer_cancellation_preserves_sibling_and_releases_resources(tmp_path):
    import multiprocessing

    semaphores_before = set(Path("/dev/shm").glob("sem.*"))
    children_before = {child.pid for child in multiprocessing.active_children()}
    # Select the real production context, replacing only paid analysis with a
    # module-level, spawn-picklable executor (not the fork closure test seam).
    manager = RunManager(tmp_path)
    assert manager._context.get_start_method() == "spawn"
    manager.executor = _spawn_noisy_executor
    first = manager.submit(_request())
    second = manager.submit(_request("MU"))
    manager.start()
    handles = []
    channels = []
    try:
        _wait_for((tmp_path / "noisy-started").exists, timeout=10)
        _wait_for(lambda: any(event["type"] == "agent" for event in first.events), timeout=10)
        with manager._lock:
            handles = list(manager._processes.values())
            channels = list(manager._channels.values())
        assert len(handles) == 2
        manager.cancel(first.id)
        (tmp_path / "release-sibling").touch()
        assert second.finished.wait(10)
        assert first.status == "cancelled"
        assert second.status == "done"
        assert any(event.get("message") == "Sibling discussion" for event in second.events)
        assert not manager._processes
        assert not manager._channels
        assert not manager._buffers
    finally:
        manager.stop()
    assert all(handle._closed for handle in handles)
    assert all(channel.fileno() == -1 for channel in channels)
    assert not manager._thread.is_alive()
    assert {child.pid for child in multiprocessing.active_children()} == children_before
    assert set(Path("/dev/shm").glob("sem.*")) == semaphores_before


def test_publication_failure_is_terminal_and_does_not_stop_scheduler(tmp_path, monkeypatch):
    original_rename = Path.rename
    attempts = 0

    def rename(source, target):
        nonlocal attempts
        if source.name == "published":
            attempts += 1
            if attempts == 1:
                raise OSError("publication unavailable")
        return original_rename(source, target)

    monkeypatch.setattr(Path, "rename", rename)
    manager = RunManager(tmp_path, executor=_write_result)
    first = manager.submit(_request())
    second = manager.submit(_request("MU"))
    manager.start()
    try:
        assert first.finished.wait(5)
        assert first.status == "failed"
        assert "publication unavailable" in (first.error or "")
        assert second.finished.wait(5)
        assert second.status == "done"
        assert manager._thread.is_alive()
        assert not any((tmp_path / ".web-staging").glob("*"))
    finally:
        manager.stop()


def test_partial_child_message_cannot_block_other_jobs_or_cancellation(tmp_path, monkeypatch):
    import tradingagents.web.runs as runs_module

    real_child = runs_module._execute_in_child
    started = tmp_path / "partial-written"

    def child(job_id, request, results_dir, executor, messages):
        if request.ticker == "AMD":
            # A writer can die between any two bytes. A readable transport does
            # not imply that a full framed message is available.
            messages.sendall(b'["event", "agent", "unfinished')
            started.touch()
            while True:
                time.sleep(0.01)
        real_child(job_id, request, results_dir, executor, messages)

    monkeypatch.setattr(runs_module, "_execute_in_child", child)
    manager = RunManager(tmp_path, executor=_write_result)
    first = manager.submit(_request())
    second = manager.submit(_request("MU"))
    manager.start()
    try:
        _wait_for(started.exists)
        assert second.finished.wait(5)
        assert second.status == "done"
        canceller = threading.Thread(target=manager.cancel, args=(first.id,), daemon=True)
        canceller.start()
        canceller.join(5)
        assert not canceller.is_alive()
        assert first.status == "cancelled"
        third = manager.submit(_request("INTC"))
        assert third.finished.wait(5)
        assert third.status == "done"
        assert not manager._processes
        assert not manager._channels
    finally:
        manager.stop()


def test_done_is_not_public_until_report_snapshot_is_published(tmp_path):
    entered = threading.Event()
    release = threading.Event()

    manager = RunManager(tmp_path, executor=_write_result)
    original_persist = manager._persist

    def blocking_persist(job, rating="Not available", **kwargs):
        entered.set()
        assert release.wait(2)
        original_persist(job, rating, **kwargs)

    manager._persist = blocking_persist
    job = manager.submit(_request())
    manager.start()
    try:
        assert entered.wait(2)
        assert job.public()["status"] == "running"
        release.set()
        assert job.finished.wait(2)
        assert job.status == "done"
    finally:
        release.set()
        manager.stop()


def test_cancelled_is_not_public_until_report_snapshot_is_published(tmp_path):
    entered = threading.Event()
    release = threading.Event()
    started = tmp_path / "started"

    def executor(request, results_dir, emit):
        started.touch()
        while True:
            time.sleep(0.01)

    manager = RunManager(tmp_path, executor=executor)
    original_persist = manager._persist

    def blocking_persist(job, rating="Not available", **kwargs):
        entered.set()
        assert release.wait(2)
        original_persist(job, rating, **kwargs)

    manager._persist = blocking_persist
    job = manager.submit(_request())
    manager.start()
    try:
        _wait_for(started.exists)
        canceller = threading.Thread(target=manager.cancel, args=(job.id,), daemon=True)
        canceller.start()
        assert entered.wait(2)
        assert job.public()["status"] not in {"done", "failed", "cancelled"}
        release.set()
        canceller.join(2)
        assert not canceller.is_alive()
        assert job.status == "cancelled"
    finally:
        release.set()
        manager.stop()


@pytest.mark.parametrize("outcome", ["failed", "cancelled", "done"])
def test_rerun_preserves_published_report_and_has_no_stale_sections(tmp_path, outcome):
    old = tmp_path / "AMD" / "2026-09-24"
    (old / "reports").mkdir(parents=True)
    (old / "reports" / "final_trade_decision.md").write_text("Rating: Buy")
    (old / "reports" / "news_report.md").write_text("Old news")
    metadata = json.dumps({"id": "original", "status": "done", "depth": 3})
    (old / "metadata.json").write_text(metadata)
    started = tmp_path / "started"

    def executor(request, results_dir, emit):
        _write_result(request, results_dir, emit)
        started.touch()
        if outcome == "failed":
            raise RuntimeError("rerun failed")
        if outcome == "cancelled":
            while True:
                time.sleep(0.01)

    manager = RunManager(tmp_path, executor=executor)
    job = manager.submit(_request())
    manager.start()
    try:
        if outcome == "cancelled":
            _wait_for(started.exists)
            manager.cancel(job.id)
        assert job.finished.wait(5)
        assert job.status == outcome
        assert (old / "metadata.json").read_text() == metadata
        assert (old / "reports" / "final_trade_decision.md").read_text() == "Rating: Buy"
        runs = {run["id"]: run for run in scan_runs(tmp_path)}
        assert next(run for run in runs.values() if run["report_dir"] == str(old / "reports"))["status"] == "done"
        current = Path(next(run for run in runs.values() if Path(run["report_dir"]).parent.name == job.id)["report_dir"])
        assert not (current / "news_report.md").exists()
        assert (current / "final_trade_decision.md").exists() == (outcome == "done")
        assert not any((tmp_path / ".web-staging").glob("*"))
    finally:
        manager.stop()


def _wait_for(predicate, timeout=5):
    deadline = time.monotonic() + timeout
    while not predicate() and time.monotonic() < deadline:
        time.sleep(0.01)
    assert predicate()


def test_sse_reconnect_resumes_after_last_event_id_without_duplicate_activity(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch, _write_result) as client:
        csrf = _login(client)
        response = client.post("/api/runs", headers={"X-CSRF-Token": csrf}, json=_request().model_dump())
        job_id = response.json()["id"]
        assert client.app.state.manager.jobs[job_id].finished.wait(5)
        url = f"/api/runs/{job_id}/events"
        original = client.get(url).text
        frames = [frame for frame in original.split("\n\n") if frame]
        ids = [int(frame.splitlines()[0].removeprefix("id: ")) for frame in frames]
        assert ids == list(range(len(frames)))
        resumed = client.get(url, headers={"Last-Event-ID": "1"})
        assert resumed.status_code == 200
        assert resumed.text == "\n\n".join(frames[2:]) + "\n\n"
        assert client.get(url, headers={"Last-Event-ID": str(ids[-1])}).text == ""
        for invalid in ("-1", "garbage", "1.2", str(len(ids)), "9" * 100):
            assert client.get(url, headers={"Last-Event-ID": invalid}).status_code == 400


def test_failed_run_is_persisted_in_history(tmp_path, monkeypatch):
    def failing_executor(request, results_dir, emit):
        emit("analysis", "Starting")
        raise RuntimeError("provider unavailable")

    with _client(tmp_path, monkeypatch, failing_executor) as client:
        csrf = _login(client)
        response = client.post(
            "/api/runs",
            headers={"X-CSRF-Token": csrf},
            json={"ticker": "AMD", "analysis_date": "2026-09-24", "depth": 1},
        )
        job_id = response.json()["id"]
        with client.stream("GET", f"/api/runs/{job_id}/events") as events:
            assert '"status":"failed"' in "".join(events.iter_text())

        history = client.get("/api/runs").json()
        failed = next(run for run in history if run["ticker"] == "AMD" and run["status"] == "failed")
        assert failed["status"] == "failed"
        assert failed["error"] == "provider unavailable"
        assert client.get(f"/api/runs/{job_id}").json()["id"] == failed["id"]
