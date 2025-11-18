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

# Create a temporary env file without CERTIVO_API_URL for Docker
# This allows docker-compose to use its default 'http://api:4000'
TEMP_ENV_FILE="${ROOT_DIR}/.docker.env.tmp"
if [[ -f "${ENV_FILE}" ]]; then
  grep -v '^CERTIVO_API_URL=' "${ENV_FILE}" > "${TEMP_ENV_FILE}" || true
  echo "🔍 Filtered env file created at ${TEMP_ENV_FILE}"
  echo "🔍 CERTIVO_API_URL in temp file: $(grep 'CERTIVO_API_URL' "${TEMP_ENV_FILE}" || echo 'NOT FOUND (correct!)')"
  compose_flags=(-f "${COMPOSE_FILE}" --env-file "${TEMP_ENV_FILE}")
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

echo "✅ All services are starting. Use 'docker compose ${compose_flags[*]} logs -f' for live logs and 'docker compose ${compose_flags[*]} down' to stop them."

# Clean up temporary env file
if [[ -f "${TEMP_ENV_FILE}" ]]; then
  rm -f "${TEMP_ENV_FILE}"
fi
