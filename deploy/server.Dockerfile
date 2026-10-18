# FastAPI server. Built from the repo root because it depends on ../agent (editable path dependency).
FROM python:3.11-slim
COPY --from=ghcr.io/astral-sh/uv:0.8.15 /uv /usr/local/bin/uv
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1
WORKDIR /app
COPY agent/ agent/
COPY server/pyproject.toml server/uv.lock server/
RUN cd server && uv sync --frozen --no-dev --no-install-project
COPY server/ server/
WORKDIR /app/server
EXPOSE 8000
CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
