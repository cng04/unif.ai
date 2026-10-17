# ASI:One relay agent (uAgents, Agentverse mailbox). Outbound connections only.
FROM python:3.11-slim
COPY --from=ghcr.io/astral-sh/uv:0.8.15 /uv /usr/local/bin/uv
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1
WORKDIR /app
COPY asi-agent/pyproject.toml asi-agent/uv.lock ./
RUN uv sync --frozen --no-install-project
COPY asi-agent/agent.py asi-agent/connect.py asi-agent/README.md ./
CMD ["uv", "run", "--no-sync", "agent.py"]
