from __future__ import annotations

import hashlib
import json
import os
import queue
import re
import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from tradingagents.agents.rating import extract_rating
from tradingagents.dataflows.symbols import safe_ticker_component

REPORT_FILES = {
    "market_report": "market_report.md",
    "sentiment_report": "sentiment_report.md",
    "news_report": "news_report.md",
    "fundamentals_report": "fundamentals_report.md",
    "investment_plan": "investment_plan.md",
    "trader_investment_plan": "trader_investment_plan.md",
    "final_trade_decision": "final_trade_decision.md",
}
DEPTHS = {1, 3, 5}
STATUSES = {"queued", "running", "done", "failed"}


class AnalysisRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=32)
    analysis_date: str
    depth: int

    @field_validator("ticker")
    @classmethod
    def validate_ticker(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized or not all(ch.isalnum() or ch in "._-^=" for ch in normalized):
            raise ValueError("Enter a valid ticker symbol")
        safe_ticker_component(normalized)
        return normalized

    @field_validator("analysis_date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        try:
            parsed = date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("Use YYYY-MM-DD") from exc
        if parsed.isoformat() != value or parsed > date.today():
            raise ValueError("Date must be today or earlier")
        return value

    @field_validator("depth")
    @classmethod
    def validate_depth(cls, value: int) -> int:
        if value not in DEPTHS:
            raise ValueError("Depth must be 1, 3, or 5")
        return value


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run_id(path: Path) -> str:
    return hashlib.sha256(str(path.resolve()).encode()).hexdigest()[:20]


def _read_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _report_dirs(results_dir: Path):
    if not results_dir.exists():
        return
    seen: set[Path] = set()
    for report_dir in results_dir.glob("*/*/reports"):
        if report_dir.is_dir() and report_dir not in seen:
            seen.add(report_dir)
            yield report_dir
    for complete in results_dir.glob("reports/*/complete_report.md"):
        if complete.parent not in seen:
            seen.add(complete.parent)
            yield complete.parent


def _identify(report_dir: Path, results_dir: Path) -> tuple[str, str]:
    rel = report_dir.relative_to(results_dir)
    if len(rel.parts) >= 3 and rel.parts[2] == "reports":
        return rel.parts[0], rel.parts[1]
    match = re.fullmatch(r"(.+)_([0-9]{8})_[0-9]{6}", report_dir.name)
    if match:
        raw_date = match.group(2)
        return match.group(1), f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:]}"
    return "Not available", "Not available"


def _file_map(report_dir: Path) -> dict[str, Path]:
    files = {p.stem: p for p in report_dir.glob("*.md") if p.is_file()}
    for section_dir in report_dir.glob("[1-5]_*"):
        if section_dir.is_dir():
            for p in section_dir.glob("*.md"):
                files.setdefault(f"{section_dir.name}_{p.stem}", p)
    return files


def scan_runs(results_dir: Path) -> list[dict]:
    """Read both legacy ticker/date reports and programmatic report trees."""
    results_dir = Path(results_dir)
    runs = []
    for report_dir in _report_dirs(results_dir) or ():
        ticker, analysis_date = _identify(report_dir, results_dir)
        metadata = _read_json(report_dir.parent / "metadata.json")
        files = _file_map(report_dir)
        decision_path = files.get("final_trade_decision") or files.get("5_portfolio_decision")
        decision = decision_path.read_text(encoding="utf-8") if decision_path else ""
        stat = report_dir.stat()
        item = {
            "id": metadata.get("id") or _run_id(report_dir),
            "ticker": metadata.get("ticker") or ticker,
            "analysis_date": metadata.get("analysis_date") or analysis_date,
            "depth": metadata.get("depth", "Not available"),
            "status": metadata.get("status", "done"),
            "rating": metadata.get("rating") or extract_rating(decision) or "Not available",
            "created_at": metadata.get("created_at") or datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
            "elapsed_seconds": metadata.get("elapsed_seconds", "Not available"),
            "error": metadata.get("error"),
            "report_dir": str(report_dir),
        }
        runs.append(item)
    return sorted(runs, key=lambda run: str(run["created_at"]), reverse=True)


def find_run(results_dir: Path, run_id: str) -> dict | None:
    return next((run for run in scan_runs(results_dir) if run["id"] == run_id), None)


def read_run(results_dir: Path, run_id: str) -> dict | None:
    run = find_run(results_dir, run_id)
    if not run:
        return None
    report_dir = Path(run.pop("report_dir"))
    run["sections"] = {key: path.read_text(encoding="utf-8") for key, path in _file_map(report_dir).items()}
    return run


def report_file(results_dir: Path, run_id: str, section: str) -> Path | None:
    if not re.fullmatch(r"[A-Za-z0-9_]+", section):
        return None
    run = find_run(results_dir, run_id)
    if not run:
        return None
    path = _file_map(Path(run["report_dir"])).get(section)
    return path if path and path.is_file() else None


def _write_canonical_reports(final_state: dict, report_dir: Path) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)
    for key, filename in REPORT_FILES.items():
        value = final_state.get(key)
        if value:
            (report_dir / filename).write_text(str(value), encoding="utf-8")


def execute_analysis(
    request: AnalysisRequest,
    results_dir: Path,
    emit: Callable[[str, str], None],
    graph_factory=None,
) -> Path:
    """Headless programmatic seam. Provider and model choices only come from env."""
    from cli.prompts import detect_asset_type
    from tradingagents.default_config import DEFAULT_CONFIG
    from tradingagents.graph.trading_graph import TradingAgentsGraph

    factory = graph_factory or TradingAgentsGraph
    asset_type = detect_asset_type(request.ticker).value
    analysts = ["market", "social", "news"]
    if asset_type == "stock":
        analysts.append("fundamentals")
    config = DEFAULT_CONFIG.copy()
    env_config = {
        "llm_provider": os.environ.get("TRADINGAGENTS_LLM_PROVIDER"),
        "quick_think_llm": os.environ.get("TRADINGAGENTS_QUICK_THINK_LLM"),
        "deep_think_llm": os.environ.get("TRADINGAGENTS_DEEP_THINK_LLM"),
        "backend_url": os.environ.get("TRADINGAGENTS_LLM_BACKEND_URL"),
    }
    config.update({key: value for key, value in env_config.items() if value})
    config.update({
        "results_dir": str(results_dir),
        "output_language": "English",
        "max_debate_rounds": request.depth,
        "max_risk_discuss_rounds": request.depth,
    })
    emit("analysis", "Starting all applicable analysts")
    graph = factory(analysts, config=config, debug=False)
    final_state, rating = graph.propagate(
        request.ticker, request.analysis_date, asset_type=asset_type
    )
    report_dir = Path(results_dir) / request.ticker / request.analysis_date / "reports"
    _write_canonical_reports(final_state, report_dir)
    if not (report_dir / "final_trade_decision.md").exists():
        raise RuntimeError("Analysis completed without a final trade decision")
    emit("report", f"Final rating: {rating}")
    return report_dir.parent


@dataclass
class Job:
    id: str
    request: AnalysisRequest
    status: Literal["queued", "running", "done", "failed"] = "queued"
    created_at: str = field(default_factory=_now)
    started_monotonic: float | None = None
    elapsed_seconds: float = 0.0
    error: str | None = None
    events: list[dict] = field(default_factory=list)
    finished: threading.Event = field(default_factory=threading.Event)

    def public(self) -> dict:
        elapsed = self.elapsed_seconds
        if self.status == "running" and self.started_monotonic is not None:
            elapsed = time.monotonic() - self.started_monotonic
        return {
            "id": self.id,
            "ticker": self.request.ticker,
            "analysis_date": self.request.analysis_date,
            "depth": self.request.depth,
            "status": self.status,
            "created_at": self.created_at,
            "elapsed_seconds": round(elapsed, 2),
            "error": self.error,
        }


class RunManager:
    """One queue and one worker guarantee at most one paid analysis at a time."""

    def __init__(self, results_dir: Path, executor=execute_analysis):
        self.results_dir = Path(results_dir)
        self.executor = executor
        self.jobs: dict[str, Job] = {}
        self._queue: queue.Queue[Job | None] = queue.Queue()
        self._thread: threading.Thread | None = None

    def start(self):
        if not self._thread or not self._thread.is_alive():
            self._thread = threading.Thread(target=self._work, name="analysis-worker", daemon=True)
            self._thread.start()

    def stop(self):
        self._queue.put(None)
        if self._thread:
            self._thread.join(timeout=5)

    def submit(self, request: AnalysisRequest) -> Job:
        job = Job(id=uuid.uuid4().hex, request=request)
        job.events.append({"type": "status", **job.public()})
        self.jobs[job.id] = job
        self._queue.put(job)
        return job

    def _emit(self, job: Job, event_type: str, message: str):
        job.events.append({"type": event_type, "message": message, **job.public()})

    def _work(self):
        while True:
            job = self._queue.get()
            if job is None:
                return
            job.status = "running"
            job.started_monotonic = time.monotonic()
            self._emit(job, "status", "Analysis running")
            try:
                current_job = job
                run_dir = self.executor(
                    current_job.request,
                    self.results_dir,
                    lambda kind, msg, current=current_job: self._emit(current, kind, msg),
                )
                job.elapsed_seconds = time.monotonic() - job.started_monotonic
                job.status = "done"
                report = (Path(run_dir) / "reports" / "final_trade_decision.md").read_text(encoding="utf-8")
                metadata = {
                    **job.public(),
                    "status": "done",
                    "rating": extract_rating(report) or "Not available",
                    "elapsed_seconds": round(job.elapsed_seconds, 2),
                }
                (Path(run_dir) / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
                self._emit(job, "status", "Analysis complete")
            except Exception as exc:
                job.elapsed_seconds = time.monotonic() - (job.started_monotonic or time.monotonic())
                job.status = "failed"
                job.error = str(exc)
                run_dir = self.results_dir / job.request.ticker / job.request.analysis_date
                (run_dir / "reports").mkdir(parents=True, exist_ok=True)
                metadata = {
                    **job.public(),
                    "status": "failed",
                    "rating": "Not available",
                    "elapsed_seconds": round(job.elapsed_seconds, 2),
                }
                (run_dir / "metadata.json").write_text(
                    json.dumps(metadata, indent=2), encoding="utf-8"
                )
                self._emit(job, "status", "Analysis failed")
            finally:
                job.finished.set()
                self._queue.task_done()
