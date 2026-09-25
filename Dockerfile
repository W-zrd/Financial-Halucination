FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS python-builder
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
WORKDIR /build
COPY pyproject.toml README.md ./
COPY cli ./cli
COPY tradingagents ./tradingagents
RUN pip install --no-cache-dir .

FROM python:3.12-slim AS runtime
ENV PATH=/opt/venv/bin:$PATH PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8082 TRADINGAGENTS_FRONTEND_DIR=/app/frontend/dist
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --home-dir /home/app --create-home app
COPY --from=python-builder /opt/venv /opt/venv
WORKDIR /app
COPY --from=python-builder --chown=app:app /build/tradingagents ./tradingagents
COPY --from=frontend --chown=app:app /build/frontend/dist ./frontend/dist
RUN install -d -o app -g app /app/results /home/app/.tradingagents
USER app
EXPOSE 8082
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8082/api/health', timeout=3)"]
CMD ["uvicorn", "tradingagents.web.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8082", "--proxy-headers", "--forwarded-allow-ips", "*"]
