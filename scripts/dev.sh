#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.dev.env"

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
mkdir -p "${DOCUMENTS_LOCAL_ROOT}"

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

echo "🚀 Starting API, Web, and CORA sidecar..."
cd "${ROOT_DIR}"
echo "🛠️  Building workspace packages..."
pnpm build >/dev/null
pnpm dlx concurrently \
  --kill-others-on-fail \
  --names "api,web,cora" \
  --prefix-colors "cyan,green,magenta" \
  "pnpm --filter @certivo/api run dev" \
  "pnpm --filter @certivo/web dev" \
  "cd apps/cora && uv run cora --reload"
