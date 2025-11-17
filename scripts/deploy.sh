#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.production"

cd "${ROOT_DIR}"

echo "🚀 Certivo Production Deployment Script"
echo "========================================"

# Check if .env.production exists
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "❌ Error: .env.production not found"
  echo "   Copy .env.production.example to .env.production and fill in the values:"
  echo "   cp .env.production.example .env.production"
  exit 1
fi

# Load environment variables
echo "🔧 Loading ${ENV_FILE}"
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

# Validate required environment variables
REQUIRED_VARS=(
  "POSTGRES_PASSWORD"
  "AUTH_JWT_SECRET"
  "CORA_OPENAI_API_KEY"
  "CERTIVO_API_TOKEN"
  "DOCUMENTS_SIGNING_SECRET"
)

for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "❌ Error: Required environment variable ${var} is not set"
    echo "   Update .env.production with the missing value"
    exit 1
  fi
done

# Check Docker and Docker Compose
if ! command -v docker &> /dev/null; then
  echo "❌ Error: Docker is not installed"
  exit 1
fi

if ! docker compose version &> /dev/null; then
  echo "❌ Error: Docker Compose is not installed"
  exit 1
fi

# Parse command line arguments
COMMAND="${1:-up}"

case "${COMMAND}" in
  up)
    echo "🏗️  Building and starting all services..."
    docker compose -f docker-compose.production.yml --env-file "${ENV_FILE}" up -d --build

    echo ""
    echo "⏳ Waiting for services to be healthy..."
    sleep 5

    echo ""
    echo "🔍 Checking service status..."
    docker compose -f docker-compose.production.yml ps

    echo ""
    echo "📊 Running database migrations..."
    docker compose -f docker-compose.production.yml exec -T api sh -c "cd /app && pnpm db:migrate"

    echo ""
    echo "🌱 Seeding database with sample data (optional)..."
    read -p "Do you want to seed the database? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      docker compose -f docker-compose.production.yml exec -T api sh -c "cd /app && pnpm db:seed"
    fi

    echo ""
    echo "✅ Deployment complete!"
    echo ""
    echo "Services available at:"
    echo "  • API:  http://localhost:4000"
    echo "  • Web:  http://localhost:3000"
    echo "  • CORA: http://localhost:8082"
    echo ""
    echo "To view logs:"
    echo "  docker compose -f docker-compose.production.yml logs -f [service]"
    echo ""
    echo "To stop all services:"
    echo "  ./scripts/deploy.sh down"
    ;;

  down)
    echo "🛑 Stopping all services..."
    docker compose -f docker-compose.production.yml --env-file "${ENV_FILE}" down
    echo "✅ All services stopped"
    ;;

  restart)
    echo "🔄 Restarting all services..."
    docker compose -f docker-compose.production.yml --env-file "${ENV_FILE}" restart
    echo "✅ All services restarted"
    ;;

  logs)
    SERVICE="${2:-}"
    if [[ -n "${SERVICE}" ]]; then
      docker compose -f docker-compose.production.yml logs -f "${SERVICE}"
    else
      docker compose -f docker-compose.production.yml logs -f
    fi
    ;;

  ps)
    docker compose -f docker-compose.production.yml ps
    ;;

  rebuild)
    SERVICE="${2:-}"
    if [[ -n "${SERVICE}" ]]; then
      echo "🏗️  Rebuilding ${SERVICE}..."
      docker compose -f docker-compose.production.yml --env-file "${ENV_FILE}" up -d --build "${SERVICE}"
    else
      echo "🏗️  Rebuilding all services..."
      docker compose -f docker-compose.production.yml --env-file "${ENV_FILE}" up -d --build
    fi
    echo "✅ Rebuild complete"
    ;;

  clean)
    echo "🧹 Cleaning up Docker resources..."
    echo "⚠️  This will remove all containers, volumes, and images"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      docker compose -f docker-compose.production.yml --env-file "${ENV_FILE}" down -v --rmi all
      echo "✅ Cleanup complete"
    else
      echo "Cancelled"
    fi
    ;;

  migrate)
    echo "📊 Running database migrations..."
    docker compose -f docker-compose.production.yml exec api sh -c "cd /app && pnpm db:migrate"
    echo "✅ Migrations complete"
    ;;

  seed)
    echo "🌱 Seeding database..."
    docker compose -f docker-compose.production.yml exec api sh -c "cd /app && pnpm db:seed"
    echo "✅ Seeding complete"
    ;;

  shell)
    SERVICE="${2:-api}"
    echo "🐚 Opening shell in ${SERVICE}..."
    docker compose -f docker-compose.production.yml exec "${SERVICE}" sh
    ;;

  help|*)
    echo "Usage: ./scripts/deploy.sh [command] [options]"
    echo ""
    echo "Commands:"
    echo "  up              Build and start all services (default)"
    echo "  down            Stop all services"
    echo "  restart         Restart all services"
    echo "  logs [service]  View logs (optionally for specific service)"
    echo "  ps              Show service status"
    echo "  rebuild [svc]   Rebuild and restart service(s)"
    echo "  clean           Remove all containers, volumes, and images"
    echo "  migrate         Run database migrations"
    echo "  seed            Seed database with sample data"
    echo "  shell [service] Open shell in service container (default: api)"
    echo "  help            Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./scripts/deploy.sh up           # Start all services"
    echo "  ./scripts/deploy.sh logs api     # View API logs"
    echo "  ./scripts/deploy.sh rebuild web  # Rebuild web service"
    echo "  ./scripts/deploy.sh shell cora   # Open shell in CORA container"
    ;;
esac
