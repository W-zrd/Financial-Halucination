from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from tradingagents.web.app import create_app
from tradingagents.web.runs import AnalysisRequest, execute_analysis, scan_runs


def _client(tmp_path: Path, monkeypatch, executor=None) -> TestClient:
    monkeypatch.setenv("WEB_USERNAME", "analyst")
    monkeypatch.setenv("WEB_PASSWORD", "correct horse battery staple")
    monkeypatch.setenv("WEB_SESSION_SECRET", "s" * 32)
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


def test_queue_is_single_worker_and_sse_reports_done(tmp_path, monkeypatch):
    active = 0
    peak = 0

    def fake_executor(request, results_dir, emit):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        emit("analysis", "Generating report")
        target = results_dir / request.ticker / request.analysis_date / "reports"
        target.mkdir(parents=True, exist_ok=True)
        (target / "final_trade_decision.md").write_text("Rating: Hold", encoding="utf-8")
        (target.parent / "metadata.json").write_text(json.dumps({"depth": request.depth}), encoding="utf-8")
        active -= 1
        return target.parent

    with _client(tmp_path, monkeypatch, fake_executor) as client:
        csrf = _login(client)
        headers = {"X-CSRF-Token": csrf}
        first = client.post("/api/runs", headers=headers, json={"ticker": "AMD", "analysis_date": "2026-09-24", "depth": 1})
        second = client.post("/api/runs", headers=headers, json={"ticker": "MU", "analysis_date": "2026-09-24", "depth": 3})
        assert first.status_code == second.status_code == 202
        run_id = second.json()["id"]
        with client.stream("GET", f"/api/runs/{run_id}/events") as response:
            body = "".join(response.iter_text())
        assert '"status":"done"' in body
        assert peak == 1


def test_analysis_config_is_env_fixed_english_and_depth_controls_both_rounds(tmp_path, monkeypatch):
    monkeypatch.setenv("TRADINGAGENTS_LLM_PROVIDER", "openai")
    monkeypatch.setenv("TRADINGAGENTS_QUICK_THINK_LLM", "quick-fixed")
    monkeypatch.setenv("TRADINGAGENTS_DEEP_THINK_LLM", "deep-fixed")
    captured = {}

    class FakeGraph:
        def __init__(self, analysts, config, debug):
            captured.update(config=config, analysts=analysts, debug=debug)
        def propagate(self, ticker, analysis_date, asset_type="stock"):
            captured["asset_type"] = asset_type
            return {"final_trade_decision": "Rating: Overweight"}, "Overweight"

    request = AnalysisRequest(ticker="AMD", analysis_date="2026-09-24", depth=5)
    execute_analysis(request, tmp_path, lambda *_: None, graph_factory=FakeGraph)
    assert captured["analysts"] == ["market", "social", "news", "fundamentals"]
    assert captured["asset_type"] == "stock"
    assert captured["config"]["max_debate_rounds"] == 5
    assert captured["config"]["max_risk_discuss_rounds"] == 5
    assert captured["config"]["output_language"] == "English"
    assert captured["config"]["quick_think_llm"] == "quick-fixed"


def test_crypto_run_omits_fundamentals_and_propagates_asset_type(tmp_path):
    captured = {}

    class FakeGraph:
        def __init__(self, analysts, config, debug):
            captured["analysts"] = analysts

        def propagate(self, ticker, analysis_date, asset_type="stock"):
            captured["asset_type"] = asset_type
            return {"final_trade_decision": "Rating: Hold"}, "Hold"

    request = AnalysisRequest(ticker="BTC-USD", analysis_date="2026-09-24", depth=1)
    execute_analysis(request, tmp_path, lambda *_: None, graph_factory=FakeGraph)

    assert captured["analysts"] == ["market", "social", "news"]
    assert captured["asset_type"] == "crypto"


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
        failed = next(run for run in history if run["id"] == job_id)
        assert failed["status"] == "failed"
        assert failed["error"] == "provider unavailable"
