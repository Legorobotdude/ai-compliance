# Use Python 3.12 slim image
FROM python:3.12-slim

# Install uv for fast Python package management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy project metadata required for dependency resolution
COPY apps/cora/pyproject.toml apps/cora/uv.lock* apps/cora/README.md ./apps/cora/

# Install dependencies
RUN cd apps/cora && \
    uv sync --frozen --no-dev

# Copy source code
COPY apps/cora ./apps/cora

# Expose CORA port
EXPOSE 8082

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8082/healthz').read()" || exit 1

WORKDIR /app/apps/cora

# Run CORA FastAPI server
CMD ["uv", "run", "cora"]
