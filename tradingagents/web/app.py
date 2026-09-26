from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .overview import build_overview
from .runs import (
    AnalysisRequest,
    DuplicateRunError,
    RunManager,
    delete_run,
    read_run,
    report_file,
    scan_runs,
)

COOKIE = "ta_session"
SESSION_TTL = 12 * 60 * 60


class LoginRequest(BaseModel):
    username: str
    password: str


class Auth:
    def __init__(self):
        self.username = os.environ.get("WEB_USERNAME", "")
        self.password = os.environ.get("WEB_PASSWORD", "")
        self.secret = os.environ.get("WEB_SESSION_SECRET", "")
        if not self.username or not self.password or len(self.secret) < 32:
            raise RuntimeError("WEB_USERNAME, WEB_PASSWORD, and WEB_SESSION_SECRET (32+ chars) are required")
        self.failures: dict[str, deque[float]] = defaultdict(deque)

    def _sign(self, payload: str) -> str:
        return hmac.new(self.secret.encode(), payload.encode(), hashlib.sha256).hexdigest()

    def issue(self) -> tuple[str, str]:
        csrf = secrets.token_urlsafe(24)
        payload = base64.urlsafe_b64encode(json.dumps({"u": self.username, "exp": int(time.time()) + SESSION_TTL, "csrf": csrf}, separators=(",", ":")).encode()).decode()
        return f"{payload}.{self._sign(payload)}", csrf

    def verify(self, token: str | None) -> dict | None:
        try:
            payload, signature = (token or "").rsplit(".", 1)
            if not hmac.compare_digest(self._sign(payload), signature):
                return None
            data = json.loads(base64.urlsafe_b64decode(payload.encode()))
            if data.get("exp", 0) < time.time() or not hmac.compare_digest(str(data.get("u", "")), self.username):
                return None
            return data
        except (ValueError, TypeError, json.JSONDecodeError):
            return None

    def login(self, ip: str, username: str, password: str) -> tuple[str, str] | None:
        now = time.monotonic()
        attempts = self.failures[ip]
        while attempts and attempts[0] < now - 300:
            attempts.popleft()
        if len(attempts) >= 5:
            raise HTTPException(429, "Too many login attempts. Try again later.")
        user_ok = hmac.compare_digest(username.encode(), self.username.encode())
        pass_ok = hmac.compare_digest(password.encode(), self.password.encode())
        if not (user_ok & pass_ok):
            attempts.append(now)
            return None
        attempts.clear()
        return self.issue()


def create_app(results_dir: Path | None = None, executor=None, frontend_dist: Path | None = None) -> FastAPI:
    auth = Auth()
    root = Path(results_dir or os.environ.get("TRADINGAGENTS_RESULTS_DIR") or "results").resolve()
    manager = RunManager(root, executor=executor) if executor else RunManager(root)

    @asynccontextmanager
    async def lifespan(_app):
        root.mkdir(parents=True, exist_ok=True)
        manager.start()
        yield
        manager.stop()

    app = FastAPI(title="TradingAgents Web", docs_url=None, redoc_url=None, lifespan=lifespan)
    app.state.manager = manager

    def session(request: Request) -> dict:
        value = auth.verify(request.cookies.get(COOKIE))
        if not value:
            raise HTTPException(401, "Authentication required")
        return value

    def csrf(request: Request, value=Depends(session)) -> dict:
        supplied = request.headers.get("X-CSRF-Token", "")
        if not hmac.compare_digest(supplied, str(value.get("csrf", ""))):
            raise HTTPException(403, "Invalid CSRF token")
        return value

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Content-Security-Policy"] = "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'"
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/auth/login")
    def login(payload: LoginRequest, request: Request, response: Response):
        ip = request.client.host if request.client else "unknown"
        issued = auth.login(ip, payload.username, payload.password)
        if not issued:
            raise HTTPException(401, "Invalid credentials")
        token, csrf_token = issued
        secure = os.environ.get("WEB_COOKIE_SECURE", "").lower() in {"1", "true", "yes"} or os.environ.get("WEB_ENV") == "production"
        response.set_cookie(COOKIE, token, httponly=True, secure=secure, samesite="strict", max_age=SESSION_TTL, path="/")
        return {"username": auth.username, "csrf_token": csrf_token}

    @app.get("/api/session")
    def get_session(value=Depends(session)):
        return {"username": value["u"], "csrf_token": value["csrf"]}

    @app.post("/api/auth/logout", status_code=204)
    def logout(response: Response, _=Depends(csrf)):
        response.delete_cookie(COOKIE, path="/")

    @app.get("/api/runs")
    def history(_=Depends(session)):
        return [{key: value for key, value in run.items() if key != "report_dir"} for run in scan_runs(root)]

    @app.get("/api/overview")
    def overview(_=Depends(session)):
        return build_overview(root)

    @app.post("/api/runs", status_code=202)
    def start_run(payload: AnalysisRequest, _=Depends(csrf)):
        try:
            return manager.submit(payload).public()
        except DuplicateRunError as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.get("/api/jobs")
    def get_jobs(_=Depends(session)):
        return manager.list_jobs()

    @app.get("/api/jobs/{job_id}")
    def get_job(job_id: str, _=Depends(session)):
        job = manager.jobs.get(job_id)
        if not job:
            raise HTTPException(404, "Run not found")
        return job.public()

    @app.post("/api/jobs/{job_id}/cancel", status_code=202)
    def cancel_job(job_id: str, _=Depends(csrf)):
        job = manager.cancel(job_id)
        if not job:
            raise HTTPException(404, "Run not found")
        return job.public()

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str, _=Depends(session)):
        run = read_run(root, run_id)
        if not run:
            raise HTTPException(404, "Run not found")
        return run

    @app.delete("/api/runs/{run_id}", status_code=204)
    def remove_run(run_id: str, _=Depends(csrf)):
        try:
            removed = delete_run(root, run_id)
        except OSError as exc:
            raise HTTPException(500, "Could not remove report") from exc
        if not removed:
            raise HTTPException(404, "Run not found")

    @app.get("/api/runs/{run_id}/raw/{section}")
    def raw(run_id: str, section: str, _=Depends(session)):
        path = report_file(root, run_id, section)
        if not path:
            raise HTTPException(404, "Report section not found")
        return Response(path.read_text(encoding="utf-8"), media_type="text/markdown; charset=utf-8")

    @app.get("/api/runs/{run_id}/download/{section}")
    def download(run_id: str, section: str, _=Depends(session)):
        path = report_file(root, run_id, section)
        if not path:
            raise HTTPException(404, "Report section not found")
        return FileResponse(path, media_type="text/markdown", filename=path.name)

    @app.get("/api/events")
    async def service_events(_=Depends(session)):
        async def ready():
            yield 'data: {"type":"status","status":"ready"}\n\n'
        return StreamingResponse(ready(), media_type="text/event-stream")

    @app.get("/api/runs/{job_id}/events")
    async def events(job_id: str, request: Request, _=Depends(session)):
        job = manager.jobs.get(job_id)
        if not job:
            raise HTTPException(404, "Run not found")
        last_id = request.headers.get("Last-Event-ID")
        start_index = 0
        if last_id is not None:
            if not last_id.isascii() or not last_id.isdecimal() or len(last_id) > 20:
                raise HTTPException(400, "Invalid Last-Event-ID")
            start_index = int(last_id) + 1
            if start_index > len(job.events):
                raise HTTPException(400, "Invalid Last-Event-ID")

        async def stream():
            index = start_index
            last_heartbeat = 0.0
            while True:
                while index < len(job.events):
                    yield f"id: {index}\ndata: {json.dumps(job.events[index], separators=(',', ':'))}\n\n"
                    index += 1
                now = time.monotonic()
                if not job.finished.is_set() and now - last_heartbeat >= 1:
                    yield f"data: {json.dumps({'type': 'heartbeat', **job.public()}, separators=(',', ':'))}\n\n"
                    last_heartbeat = now
                if job.finished.is_set() and index >= len(job.events):
                    return
                await asyncio.sleep(0.05)

        return StreamingResponse(stream(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})

    dist = Path(frontend_dist or os.environ.get("TRADINGAGENTS_FRONTEND_DIR") or Path(__file__).parents[2] / "frontend" / "dist")
    if dist.exists():
        assets = dist / "assets"
        if assets.exists():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/{path:path}", response_class=HTMLResponse)
        def spa(path: str):
            candidate = (dist / path).resolve()
            if path and candidate.is_relative_to(dist.resolve()) and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

    return app


def main():
    import uvicorn

    uvicorn.run("tradingagents.web.app:create_app", factory=True, host="0.0.0.0", port=int(os.environ.get("PORT", "8082")))


if __name__ == "__main__":
    main()
