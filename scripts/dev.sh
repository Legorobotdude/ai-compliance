#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.dev.env"
INFRA_DOCKER_DIR="${ROOT_DIR}/infra/docker"
CERTIVO_STATE_DIR="${ROOT_DIR}/.certivo"

if [[ -f "${ENV_FILE}" ]]; then
  echo "🔧 Loading ${ENV_FILE}"
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

export DATABASE_URL="${DATABASE_URL:-postgres://certivo:certivo@localhost:5432/certivo}"
export AUTH_JWT_SECRET="${AUTH_JWT_SECRET:-dev-secret}"
export AUTH_ISSUER="${AUTH_ISSUER:-https://auth.dev.certivo}"
export AUTH_AUDIENCE="${AUTH_AUDIENCE:-certivo-api}"
export CORA_API_URL="${CORA_API_URL:-http://localhost:8082}"
export CERTIVO_API_URL="${CERTIVO_API_URL:-http://localhost:4000}"
export CORA_DATABASE_URL="${CORA_DATABASE_URL:-$DATABASE_URL}"
export CORA_OPENAI_MODEL="${CORA_OPENAI_MODEL:-gpt-4o-mini}"
export DOCUMENTS_LOCAL_ROOT="${DOCUMENTS_LOCAL_ROOT:-${ROOT_DIR}/.certivo/documents}"
export DOCUMENTS_PUBLIC_BASE_URL="${DOCUMENTS_PUBLIC_BASE_URL:-${CERTIVO_API_URL}}"
export DOCUMENTS_SIGNING_SECRET="${DOCUMENTS_SIGNING_SECRET:-${AUTH_JWT_SECRET:-dev-docs-secret}}"
export TEMPORAL_ADDRESS="${TEMPORAL_ADDRESS:-localhost:7233}"
export TEMPORAL_NAMESPACE="${TEMPORAL_NAMESPACE:-default}"
export TEMPORAL_SUPPLIER_TASK_QUEUE="${TEMPORAL_SUPPLIER_TASK_QUEUE:-supplier-workflows}"
export TEMPORAL_INGESTION_TASK_QUEUE="${TEMPORAL_INGESTION_TASK_QUEUE:-ingestion-retries}"
mkdir -p "${CERTIVO_STATE_DIR}"
mkdir -p "${DOCUMENTS_LOCAL_ROOT}"

check_postgres_ready() {
  node <<'NODE' >/dev/null 2>&1
const { Client } = require('pg');
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 2000,
});
client.connect()
  .then(() => client.end().then(() => process.exit(0)))
  .catch(() => process.exit(1));
NODE
}

database_hostname() {
  python3 <<'PY'
import os
from urllib.parse import urlparse

url = os.environ.get("DATABASE_URL", "")
try:
    parsed = urlparse(url)
    print(parsed.hostname or "")
except Exception:
    print("")
PY
}

check_port_open() {
  local host="$1"
  local port="$2"
  if command -v nc >/dev/null 2>&1; then
    nc -z "${host}" "${port}" >/dev/null 2>&1
    return $?
  fi

  python3 - "$host" "$port" <<'PY' >/dev/null 2>&1
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])

sock = socket.socket()
sock.settimeout(1)
try:
    sock.connect((host, port))
except OSError:
    sys.exit(1)
sys.exit(0)
PY
}

ensure_local_infra() {
  if check_postgres_ready; then
    echo "✅ Postgres is reachable at ${DATABASE_URL}"
    return
  fi

  local host
  host="$(database_hostname)"
  if [[ -z "${host}" ]]; then
    echo "❌ Unable to parse DATABASE_URL (${DATABASE_URL}). Please check the value."
    exit 1
  fi

  if [[ "${host}" != "localhost" && "${host}" != "127.0.0.1" ]]; then
    echo "❌ Postgres at ${DATABASE_URL} is unreachable and automatic Docker startup only runs for localhost targets."
    exit 1
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "❌ Postgres is unreachable and Docker is not installed. Install Docker Desktop or start Postgres manually."
    exit 1
  fi

  echo "🧱 Postgres is unreachable. Starting local infra via docker compose..."
  (
    cd "${INFRA_DOCKER_DIR}"
    docker compose up -d
  )

  echo "⏳ Waiting for Postgres to become ready..."
  for attempt in {1..30}; do
    if check_postgres_ready; then
      echo "✅ Postgres is ready."
      return
    fi
    sleep 2
  done

  echo "❌ Postgres is still unreachable after waiting. Check 'docker compose logs' under ${INFRA_DOCKER_DIR}."
  exit 1
}

ensure_temporal_dev_server() {
  local temporal_host="${TEMPORAL_ADDRESS}"
  local temporal_port="7233"

  if [[ "${TEMPORAL_ADDRESS}" == *:* ]]; then
    temporal_host="${TEMPORAL_ADDRESS%:*}"
    temporal_port="${TEMPORAL_ADDRESS##*:}"
  fi

  if check_port_open "${temporal_host}" "${temporal_port}"; then
    echo "✅ Temporal is reachable at ${TEMPORAL_ADDRESS}"
    return
  fi

  if [[ "${temporal_host}" != "localhost" && "${temporal_host}" != "127.0.0.1" ]]; then
    echo "❌ Temporal at ${TEMPORAL_ADDRESS} is unreachable and automatic startup only supports localhost."
    exit 1
  fi

  if ! command -v temporal >/dev/null 2>&1; then
    echo "❌ Temporal CLI is not installed, so we cannot auto-start the dev server."
    echo "   Install it from https://docs.temporal.io/cli/ and rerun pnpm dev."
    exit 1
  fi

  local temporal_log="${CERTIVO_STATE_DIR}/temporal-dev.log"
  local temporal_pid_file="${CERTIVO_STATE_DIR}/temporal-dev.pid"

  echo "⚙️  Temporal is not running. Starting 'temporal server start-dev'..."
  temporal server start-dev >"${temporal_log}" 2>&1 &
  local temporal_pid=$!
  echo "${temporal_pid}" > "${temporal_pid_file}"

  echo "⏳ Waiting for Temporal to accept connections..."
  for attempt in {1..30}; do
    if check_port_open "${temporal_host}" "${temporal_port}"; then
      echo "✅ Temporal dev server is ready at ${TEMPORAL_ADDRESS}"
      return
    fi

    if ! kill -0 "${temporal_pid}" >/dev/null 2>&1; then
      echo "❌ Temporal dev server exited early. Check ${temporal_log}"
      exit 1
    fi

    sleep 2
  done

  echo "❌ Temporal dev server did not start in time. Check ${temporal_log} for details."
  exit 1
}

if [[ -z "${CERTIVO_API_TOKEN:-}" ]]; then
  echo "❌ CERTIVO_API_TOKEN is not set."
  echo "   Run 'node infra/docker/generate-dev-token.mjs' and place the token in .dev.env:"
  echo "   CERTIVO_API_TOKEN=\"<token>\""
  exit 1
fi

if [[ -z "${CORA_OPENAI_API_KEY:-}" ]]; then
  echo "❌ CORA_OPENAI_API_KEY is not set."
  echo "   Add your OpenAI key to .dev.env:"
  echo "   CORA_OPENAI_API_KEY=\"sk-...\""
  exit 1
fi

ensure_local_infra
ensure_temporal_dev_server

echo "🚀 Starting API, Web, CORA sidecar, and Temporal worker..."
cd "${ROOT_DIR}"
echo "🛠️  Building workspace packages..."
pnpm build >/dev/null
pnpm dlx concurrently \
  --kill-others-on-fail \
  --names "api,web,cora,worker" \
  --prefix-colors "cyan,green,magenta,blue" \
  "pnpm --filter @certivo/api run dev" \
  "pnpm --filter @certivo/web dev" \
  "cd apps/cora && uv run cora --reload" \
  "pnpm --filter @certivo/worker run dev"
