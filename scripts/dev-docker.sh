#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.dev.env"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.production.yml"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "❌ Unable to find ${COMPOSE_FILE}. Run this script from within the Certivo repo."
  exit 1
fi

if [[ -f "${ENV_FILE}" ]]; then
  echo "🔧 Loading ${ENV_FILE}"
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
else
  echo "ℹ️  ${ENV_FILE} not found. Falling back to the current shell environment."
fi

export AUTH_JWT_SECRET="${AUTH_JWT_SECRET:-dev-secret}"
export AUTH_ISSUER="${AUTH_ISSUER:-https://auth.dev.certivo}"
export AUTH_AUDIENCE="${AUTH_AUDIENCE:-certivo-api}"
export DOCUMENTS_SIGNING_SECRET="${DOCUMENTS_SIGNING_SECRET:-${AUTH_JWT_SECRET}}"
export CORA_OPENAI_MODEL="${CORA_OPENAI_MODEL:-gpt-4o-mini}"
export DOCUMENTS_PUBLIC_BASE_URL="${DOCUMENTS_PUBLIC_BASE_URL:-http://localhost:4000}"

if [[ -z "${CERTIVO_API_TOKEN:-}" ]]; then
  echo "❌ CERTIVO_API_TOKEN is not set. Run 'node infra/docker/generate-dev-token.mjs' and add it to .dev.env or your shell."
  exit 1
fi

if [[ -z "${CORA_OPENAI_API_KEY:-}" ]]; then
  echo "❌ CORA_OPENAI_API_KEY is not set. Add your OpenAI key to .dev.env or export it before running this script."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker is not installed. Install Docker Desktop (or Docker Engine) to continue."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "❌ Docker Compose v2 is required. Update Docker Desktop or install the standalone compose plugin."
  exit 1
fi

# Warn if CERTIVO_API_URL is set (should be commented out for Docker)
if [[ -n "${CERTIVO_API_URL:-}" ]]; then
  echo "⚠️  WARNING: CERTIVO_API_URL is set to '${CERTIVO_API_URL}'"
  echo "⚠️  For Docker deployment, this should be commented out in .dev.env"
  echo "⚠️  Docker containers should use the default 'http://api:4000' instead"
  echo ""
fi

# Set up compose flags
if [[ -f "${ENV_FILE}" ]]; then
  compose_flags=(-f "${COMPOSE_FILE}" --env-file "${ENV_FILE}")
else
  compose_flags=(-f "${COMPOSE_FILE}")
fi

echo "🧹 Stopping any existing Certivo stack..."
(
  cd "${ROOT_DIR}"
  docker compose "${compose_flags[@]}" down --remove-orphans >/dev/null 2>&1 || true
)

echo "🧹 Removing leftover containers if they exist..."
for name in certivo-postgres certivo-redis certivo-temporal certivo-api certivo-cora certivo-worker certivo-web; do
  if docker ps -a --format '{{.Names}}' | grep -q "^${name}$"; then
    docker rm -f "${name}" >/dev/null 2>&1 || true
  fi
done

echo "🚢 Building and starting the full Certivo stack via Docker Compose..."
(
  cd "${ROOT_DIR}"
  docker compose "${compose_flags[@]}" up -d --build
)

echo ""
echo "✅ All services are starting!"
echo ""
echo "📋 Common commands:"
echo "  View logs:       docker compose -f ${COMPOSE_FILE} logs -f"
echo "  View API logs:   docker compose -f ${COMPOSE_FILE} logs -f api"
echo "  Stop services:   docker compose -f ${COMPOSE_FILE} down"
echo "  Run migrations:  docker exec certivo-api node libs/db/scripts/run-migrations.mjs"
echo "  Seed database:   docker exec certivo-api node libs/db/scripts/seed-sample-data.mjs"
echo ""
echo "🌐 Access points:"
echo "  Web:  http://localhost:3000"
echo "  API:  http://localhost:4000"
echo "  CORA: http://localhost:8082"
echo ""
