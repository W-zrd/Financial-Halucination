from __future__ import annotations

import hashlib
import json
import multiprocessing
import os
import queue
import re
import shutil
import socket
import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Literal

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
STATUSES = {"queued", "running", "done", "failed", "cancelled"}
FINAL_RATING = re.compile(
    r"^\s*(?:#{1,6}\s*)?(?:\*\*)?(?P<final>final\s+)?(?:rating|decision|recommendation|verdict)"
    r"(?:\*\*)?\s*[:\-–—]\s*(?:\*\*)?\s*(?P<rating>Buy|Overweight|Hold|Underweight|Sell)\b",
    re.IGNORECASE | re.MULTILINE,
)
LEADING_VERDICT = re.compile(r"^\s*\*\*(Buy|Overweight|Hold|Underweight|Sell)\*\*\s*(?:\r?\n|$)", re.IGNORECASE)


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


def _run_id(path: Path, stat: os.stat_result | None = None) -> str:
    stat = stat if stat is not None else path.stat()
    identity = f"{path.absolute()}:{stat.st_dev}:{stat.st_ino}:{stat.st_ctime_ns}"
    return "report-" + hashlib.sha256(identity.encode()).hexdigest()


def _final_rating(decision: str) -> str | None:
    labels = list(FINAL_RATING.finditer(decision))
    explicit_final = next((match for match in reversed(labels) if match.group("final")), None)
    leading = LEADING_VERDICT.match(decision)
    if explicit_final:
        return explicit_final.group("rating").capitalize()
    if leading:
        return leading.group(1).capitalize()
    return labels[0].group("rating").capitalize() if labels else None


def _read_json(path: Path) -> dict:
    if path.is_symlink():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _is_real_descendant(path: Path, root: Path) -> bool:
    """Reject aliases so one visible run cannot own another run's files."""
    try:
        absolute = path.absolute()
        return absolute != root and absolute.is_relative_to(root) and absolute.resolve() == absolute
    except (OSError, RuntimeError):
        return False


def _report_dirs(results_dir: Path):
    if not results_dir.exists():
        return
    results_dir = results_dir.resolve()
    seen: set[Path] = set()
    for report_dir in results_dir.glob("*/*/reports"):
        if (
            report_dir.is_dir()
            and _is_real_descendant(report_dir, results_dir)
            and not (report_dir / ".web-hidden").exists()
            and report_dir not in seen
        ):
            seen.add(report_dir)
            yield report_dir
    for complete in results_dir.glob("reports/*/complete_report.md"):
        if (
            not complete.is_symlink()
            and _is_real_descendant(complete.parent, results_dir)
            and not (complete.parent / ".web-hidden").exists()
            and complete.parent not in seen
        ):
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
    files = {p.stem: p for p in report_dir.glob("*.md") if p.is_file() and not p.is_symlink()}
    for section_dir in report_dir.glob("[1-5]_*"):
        if section_dir.is_dir() and not section_dir.is_symlink():
            for p in section_dir.glob("*.md"):
                if p.is_file() and not p.is_symlink():
                    files.setdefault(f"{section_dir.name}_{p.stem}", p)
    return files


def scan_runs(results_dir: Path) -> list[dict]:
    """Read both legacy ticker/date reports and programmatic report trees."""
    results_dir = Path(results_dir).resolve()
    runs = []
    for report_dir in _report_dirs(results_dir) or ():
        ticker, analysis_date = _identify(report_dir, results_dir)
        metadata = _read_json(report_dir.parent / "metadata.json")
        files = _file_map(report_dir)
        decision_path = files.get("final_trade_decision") or files.get("5_portfolio_decision")
        decision = decision_path.read_text(encoding="utf-8") if decision_path else ""
        stat = report_dir.stat()
        run_id = _run_id(report_dir)
        item = {
            "id": run_id,
            "ticker": metadata.get("ticker") or ticker,
            "analysis_date": metadata.get("analysis_date") or analysis_date,
            "depth": metadata.get("depth", "Not available"),
            "status": metadata.get("status", "done"),
            "rating": _final_rating(decision) or "Not available",
            "created_at": metadata.get("created_at") or datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
            "elapsed_seconds": metadata.get("elapsed_seconds", "Not available"),
            "error": metadata.get("error"),
            "report_dir": str(report_dir),
        }
        runs.append(item)
    if len({run["id"] for run in runs}) != len(runs):
        raise OSError("Run identifier collision")
    return sorted(runs, key=lambda run: str(run["created_at"]), reverse=True)


def find_run(results_dir: Path, run_id: str) -> dict | None:
    return next((run for run in scan_runs(results_dir) if run["id"] == run_id), None)


def read_run(results_dir: Path, run_id: str) -> dict | None:
    run = find_run(results_dir, run_id)
    if not run and re.fullmatch(r"[A-Za-z0-9_-]{1,80}", run_id):
        root = Path(results_dir).resolve()
        report_dir = root / ".web-runs" / run_id / "reports"
        if _is_real_descendant(report_dir, root) and _read_json(report_dir.parent / "metadata.json").get("id") == run_id:
            run = next((item for item in scan_runs(root) if item["report_dir"] == str(report_dir)), None)
    if not run:
        return None
    report_dir = Path(run.pop("report_dir"))
    try:
        if _run_id(report_dir) != run["id"]:
            return None
        run["sections"] = {key: path.read_text(encoding="utf-8") for key, path in _file_map(report_dir).items()}
        if _run_id(report_dir) != run["id"]:
            return None
    except (FileNotFoundError, NotADirectoryError):
        return None
    return run


def report_file(results_dir: Path, run_id: str, section: str) -> Path | None:
    if not re.fullmatch(r"[A-Za-z0-9_]+", section):
        return None
    run = find_run(results_dir, run_id)
    if not run:
        return None
    report_dir = Path(run["report_dir"])
    try:
        if _run_id(report_dir) != run["id"]:
            return None
        path = _file_map(report_dir).get(section)
        return path if path and path.is_file() and _run_id(report_dir) == run["id"] else None
    except (FileNotFoundError, NotADirectoryError):
        return None


def delete_run(results_dir: Path, run_id: str) -> bool:
    """Hide one report instance from history without deleting its files."""
    root = Path(results_dir).resolve()
    run = find_run(root, run_id)
    if not run:
        return False
    report_dir = Path(run["report_dir"]).absolute()
    if not _is_real_descendant(report_dir, root):
        raise OSError("Report path is outside the results directory")
    relative = report_dir.relative_to(root)
    if not (
        len(relative.parts) == 3 and relative.parts[2] == "reports" and relative.parts[0] != "reports"
        or len(relative.parts) == 2 and relative.parts[0] == "reports"
    ):
        raise OSError("Unrecognized report layout")
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    descriptor = os.open(root, flags)
    try:
        for part in relative.parts:
            child = os.open(part, flags, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        if _run_id(report_dir, os.fstat(descriptor)) != run_id:
            return False
        try:
            marker = os.open(".web-hidden", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=descriptor)
        except FileExistsError:
            return False
        os.close(marker)
    finally:
        os.close(descriptor)
    return True


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
    from tradingagents.default_config import DEFAULT_CONFIG, _coerce
    from tradingagents.graph.trading_graph import TradingAgentsGraph
    from tradingagents.llm_clients.factory import _coerce_max_retries

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
        "llm_max_retries": os.environ.get("TRADINGAGENTS_LLM_MAX_RETRIES"),
        "checkpoint_enabled": os.environ.get("TRADINGAGENTS_CHECKPOINT_ENABLED"),
    }
    for key, value in env_config.items():
        if value:
            coerced = _coerce(value, DEFAULT_CONFIG.get(key))
            config[key] = _coerce_max_retries(coerced) if key == "llm_max_retries" else coerced
    config.update({
        "results_dir": str(results_dir),
        "output_language": "English",
        "max_debate_rounds": request.depth,
        "max_risk_discuss_rounds": request.depth,
    })
    emit("analysis", "Starting all applicable analysts")
    graph = factory(analysts, config=config, debug=False)
    seen_agent_content: set[str] = set()
    seen_stages: set[str] = set()
    stage_names = {
        "market_report": "Market analysis complete",
        "sentiment_report": "Social sentiment analysis complete",
        "news_report": "News analysis complete",
        "fundamentals_report": "Fundamentals analysis complete",
        "investment_plan": "Research debate complete",
        "trader_investment_plan": "Trading plan complete",
        "final_trade_decision": "Risk review complete",
    }

    def emit_agent(label: str, value) -> None:
        content = str(value or "").strip()
        if not content or content in seen_agent_content:
            return
        seen_agent_content.add(content)
        emit("agent", f"{label}: {content}" if label else content)

    def on_chunk(chunk: dict) -> None:
        for key, label in stage_names.items():
            if chunk.get(key) and key not in seen_stages:
                seen_stages.add(key)
                emit("stage", label)
        for message in chunk.get("messages") or ():
            emit_agent("", getattr(message, "content", ""))

        research = chunk.get("investment_debate_state") or {}
        current = str(research.get("current_response") or "").strip()
        judge = str(research.get("judge_decision") or "").strip()
        if current and current != judge:
            if str(research.get("bull_history") or "").rstrip().endswith(current):
                label = "Bull researcher"
            elif str(research.get("bear_history") or "").rstrip().endswith(current):
                label = "Bear researcher"
            else:
                label = "Research debate"
            emit_agent(label, current)
        emit_agent("Research manager", judge)

        risk = chunk.get("risk_debate_state") or {}
        for key, label in (
            ("current_aggressive_response", "Aggressive risk analyst"),
            ("current_conservative_response", "Conservative risk analyst"),
            ("current_neutral_response", "Neutral risk analyst"),
            ("judge_decision", "Portfolio manager"),
        ):
            emit_agent(label, risk.get(key))

    final_state, rating = graph.propagate(
        request.ticker, request.analysis_date, asset_type=asset_type, on_chunk=on_chunk
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
    status: Literal["queued", "running", "done", "failed", "cancelled"] = "queued"
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


class DuplicateRunError(ValueError):
    pass


MAX_MESSAGE_BYTES = 8 * 1024 * 1024


def _execute_in_child(job_id, request, results_dir, executor, messages) -> None:
    """Each child owns a private stream: terminating it cannot corrupt siblings."""
    def send(kind, value=None, detail=None):
        data = json.dumps((kind, value, detail)).encode("utf-8") + b"\n"
        if len(data) > MAX_MESSAGE_BYTES:
            raise ValueError("Analysis event exceeds transport size limit")
        messages.sendall(data)

    try:
        executor(request, results_dir, lambda kind, message: send("event", kind, str(message)))
        send("done")
    except BaseException as exc:
        send("failed", str(exc)[:65536])
    finally:
        messages.close()


class RunManager:
    """Parent-owned scheduler for isolated, cancellable analysis processes."""

    def __init__(self, results_dir: Path, executor=execute_analysis):
        self.results_dir = Path(results_dir)
        self.executor = executor
        self.jobs: dict[str, Job] = {}
        self._queue: queue.Queue[Job | None] = queue.Queue()
        self._thread: threading.Thread | None = None
        self._lock = threading.RLock()
        self._stopping = threading.Event()
        try:
            self.max_concurrent = int(os.environ.get("TRADINGAGENTS_WEB_MAX_CONCURRENT", "2"))
        except ValueError as exc:
            raise ValueError("TRADINGAGENTS_WEB_MAX_CONCURRENT must be an integer") from exc
        if self.max_concurrent < 1:
            raise ValueError("TRADINGAGENTS_WEB_MAX_CONCURRENT must be at least 1")
        # Production uses spawn: forking a threaded Uvicorn process can inherit
        # locks held by graph/provider libraries. Injected test executors may be
        # local closures, so that explicit seam uses fork on supported Linux.
        context_name = "spawn" if executor is execute_analysis else "fork"
        self._context: Any = multiprocessing.get_context(context_name)
        self._channels: dict[str, socket.socket] = {}
        self._buffers: dict[str, bytearray] = {}
        self._processes: dict[str, Any] = {}

    def start(self):
        if not self._thread or not self._thread.is_alive():
            self._stopping.clear()
            self._thread = threading.Thread(target=self._work, name="analysis-worker", daemon=True)
            self._thread.start()

    def stop(self):
        self._stopping.set()
        if self._thread:
            self._thread.join(timeout=5)
        for job in list(self.jobs.values()):
            if job.status in {"queued", "running"}:
                self.cancel(job.id)

    def submit(self, request: AnalysisRequest) -> Job:
        job = Job(id=uuid.uuid4().hex, request=request)
        with self._lock:
            if any(
                current.status in {"queued", "running"}
                and current.request.ticker == request.ticker
                and current.request.analysis_date == request.analysis_date
                for current in self.jobs.values()
            ):
                raise DuplicateRunError(
                    f"An analysis for {request.ticker} on {request.analysis_date} is already in progress"
                )
            job.events.append({"type": "status", **job.public()})
            self.jobs[job.id] = job
        self._queue.put(job)
        return job

    def list_jobs(self) -> list[dict]:
        with self._lock:
            return [job.public() for job in self.jobs.values()]

    def _emit(self, job: Job, event_type: str, message: str):
        with self._lock:
            job.events.append({"type": event_type, "message": message, **job.public()})

    def _staging_dir(self, job: Job) -> Path:
        return self.results_dir / ".web-staging" / job.id

    def _run_dir(self, job: Job) -> Path:
        return self._staging_dir(job) / job.request.ticker / job.request.analysis_date

    def _persist(
        self,
        job: Job,
        rating: str = "Not available",
        *,
        status: Literal["done", "failed", "cancelled"] | None = None,
        error: str | None = None,
    ) -> None:
        # Publish immutable job snapshots with one same-filesystem rename. Legacy
        # ticker/date reports remain intact; history discovers both layouts.
        staging = self._staging_dir(job)
        snapshot = staging / "published"
        persisted_status = status or job.status
        metadata = job.public()
        metadata.update(
            status=persisted_status,
            error=error,
            rating=rating,
        )
        try:
            snapshot.mkdir(parents=True, exist_ok=True)
            if persisted_status == "done":
                self._run_dir(job).joinpath("reports").rename(snapshot / "reports")
            else:
                (snapshot / "reports").mkdir()
            (snapshot / "metadata.json").write_text(
                json.dumps(metadata, indent=2), encoding="utf-8"
            )
            published = self.results_dir / ".web-runs"
            published.mkdir(parents=True, exist_ok=True)
            snapshot.rename(published / job.id)
        finally:
            shutil.rmtree(staging, ignore_errors=True)

    def _release_process(self, job_id: str) -> None:
        channel = self._channels.pop(job_id, None)
        if channel is not None:
            channel.close()
        self._buffers.pop(job_id, None)
        process = self._processes.pop(job_id, None)
        if process is not None:
            if process.is_alive():
                process.terminate()
                process.join(timeout=2)
                if process.is_alive():
                    process.kill()
            process.join()
            process.close()

    def cancel(self, job_id: str) -> Job | None:
        with self._lock:
            job = self.jobs.get(job_id)
            if job is None:
                return None
            if job.status in {"done", "failed", "cancelled"}:
                return job
            self._release_process(job_id)
            if job.started_monotonic is not None:
                job.elapsed_seconds = time.monotonic() - job.started_monotonic
            status: Literal["cancelled", "failed"] = "cancelled"
            error = None
            try:
                self._persist(job, status=status, error=error)
            except OSError as exc:
                status = "failed"
                error = f"Could not publish analysis: {exc}"
            job.status = status
            job.error = error
            self._emit(job, "status", "Analysis cancelled" if status == "cancelled" else "Analysis failed")
            job.finished.set()
            return job

    def _finish(
        self,
        job: Job,
        status: Literal["done", "failed"],
        error: str | None = None,
    ) -> None:
        with self._lock:
            if job.status == "cancelled":
                return
            self._release_process(job.id)
            job.elapsed_seconds = time.monotonic() - (job.started_monotonic or time.monotonic())
            if status == "done":
                decision = self._run_dir(job) / "reports" / "final_trade_decision.md"
                if not decision.is_file():
                    status = "failed"
                    error = "Analysis completed without a final trade decision"
                    rating = "Not available"
                else:
                    rating = extract_rating(decision.read_text(encoding="utf-8")) or "Not available"
            else:
                rating = "Not available"
            try:
                self._persist(job, rating, status=status, error=error)
            except OSError as exc:
                status = "failed"
                error = f"Could not publish analysis: {exc}"
            job.status = status
            job.error = error
            self._emit(job, "status", "Analysis complete" if status == "done" else "Analysis failed")
            job.finished.set()

    def _drain_messages(self) -> None:
        # Never use Connection.recv()/Queue.get(): even after poll(), a partial
        # frame can block forever. Bound each tick so a noisy child cannot starve
        # cancellation or a sibling; retain incomplete frames between ticks.
        for job_id, channel in list(self._channels.items()):
            job = self.jobs[job_id]
            buffer = self._buffers[job_id]
            try:
                for _ in range(4):
                    try:
                        data = channel.recv(65536)
                    except BlockingIOError:
                        break
                    if not data:
                        self._finish(job, "failed", "Analysis process closed its output without completion")
                        break
                    buffer.extend(data)
                    while b"\n" in buffer:
                        line, _, remainder = buffer.partition(b"\n")
                        buffer[:] = remainder
                        if len(line) > MAX_MESSAGE_BYTES:
                            raise ValueError("Analysis event exceeds transport size limit")
                        kind, value, detail = json.loads(line)
                        if kind == "event":
                            self._emit(job, value, detail)
                        elif kind in {"done", "failed"}:
                            self._finish(job, kind, value)
                            break
                        else:
                            raise ValueError("Unknown analysis message")
                    if job.finished.is_set():
                        break
                    if len(buffer) > MAX_MESSAGE_BYTES:
                        raise ValueError("Analysis event exceeds transport size limit")
            except (OSError, ValueError, TypeError) as exc:
                self._finish(job, "failed", f"Analysis transport failed: {exc}")

    def _launch_ready(self) -> None:
        with self._lock:
            self._launch_ready_locked()

    def _launch_ready_locked(self) -> None:
        while not self._stopping.is_set() and len(self._processes) < self.max_concurrent:
            try:
                job = self._queue.get_nowait()
            except queue.Empty:
                return
            if job is None:
                return
            if job.status == "cancelled":
                self._queue.task_done()
                continue
            job.status = "running"
            job.started_monotonic = time.monotonic()
            process = None
            writer = None
            try:
                reader, writer = socket.socketpair()
                reader.setblocking(False)
                self._channels[job.id] = reader
                self._buffers[job.id] = bytearray()
                process = self._context.Process(
                    target=_execute_in_child,
                    args=(job.id, job.request, self._staging_dir(job), self.executor, writer),
                    name=f"analysis-{job.id[:8]}",
                )
                process.start()
                self._processes[job.id] = process
                self._emit(job, "status", "Analysis running")
            except Exception as exc:
                if process is not None:
                    process.close()
                self._finish(job, "failed", str(exc))
            finally:
                if writer is not None:
                    writer.close()
                self._queue.task_done()

    def _work(self):
        while not self._stopping.is_set():
            with self._lock:
                self._drain_messages()
                self._launch_ready()
            self._stopping.wait(0.01)
