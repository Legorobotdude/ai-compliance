# Certivo Production Deployment Guide

This guide covers deploying Certivo using Docker Compose for production environments.

## Overview

The production deployment includes:
- **API Service** (Express + TypeScript) - Port 4000
- **Web Service** (Next.js) - Port 3000
- **CORA AI Service** (FastAPI + Python) - Port 8082
- **Worker Service** (Temporal Worker) - Background tasks
- **PostgreSQL** (with pgvector) - Port 5432
- **Redis** - Port 6379
- **Temporal Server** - Port 7233

## Prerequisites

- **Docker** 20.10+ ([Install Docker](https://docs.docker.com/get-docker/))
- **Docker Compose** 2.0+ (included with Docker Desktop)
- Minimum 4GB RAM, 10GB disk space
- OpenAI API key (for CORA AI features)

## Quick Start

### 1. Clone and Setup Environment

```bash
# Clone repository
git clone <your-repo-url>
cd Certivo

# Copy environment template
cp .env.production.example .env.production

# Edit .env.production with your values
nano .env.production
```

### 2. Configure Required Environment Variables

Edit `.env.production` and set these **required** values:

```bash
# Database password (use a strong password)
POSTGRES_PASSWORD=your-secure-postgres-password

# JWT secret (minimum 32 characters)
AUTH_JWT_SECRET=your-secure-jwt-secret-min-32-chars

# OpenAI API key for CORA
CORA_OPENAI_API_KEY=sk-your-openai-api-key

# Generate API token for web app
# Run: node infra/docker/generate-dev-token.mjs
CERTIVO_API_TOKEN=<output-from-generate-dev-token>

# Document signing secret
DOCUMENTS_SIGNING_SECRET=your-secure-document-signing-secret
```

### 3. Generate API Token

```bash
# Generate JWT token for web app authentication
node infra/docker/generate-dev-token.mjs

# Copy the output token to .env.production
# CERTIVO_API_TOKEN="<paste-token-here>"
```

### 4. Deploy All Services

```bash
# Make deploy script executable
chmod +x scripts/deploy.sh

# Start all services
./scripts/deploy.sh up
```

The script will:
1. Build all Docker images
2. Start all services
3. Wait for health checks
4. Run database migrations
5. Optionally seed sample data

### 5. Verify Deployment

```bash
# Check service status
./scripts/deploy.sh ps

# View logs
./scripts/deploy.sh logs

# Test API health
curl http://localhost:4000/healthz

# Test readiness
curl http://localhost:4000/readyz
```

Access the application:
- **Web Dashboard**: http://localhost:3000
- **API**: http://localhost:4000
- **CORA AI**: http://localhost:8082

## Deployment Script Commands

The `scripts/deploy.sh` script provides convenient commands:

```bash
# Start all services
./scripts/deploy.sh up

# Stop all services
./scripts/deploy.sh down

# Restart all services
./scripts/deploy.sh restart

# View logs (all services)
./scripts/deploy.sh logs

# View logs for specific service
./scripts/deploy.sh logs api
./scripts/deploy.sh logs web
./scripts/deploy.sh logs cora

# Check service status
./scripts/deploy.sh ps

# Rebuild all services
./scripts/deploy.sh rebuild

# Rebuild specific service
./scripts/deploy.sh rebuild api

# Run database migrations
./scripts/deploy.sh migrate

# Seed database with sample data
./scripts/deploy.sh seed

# Open shell in container
./scripts/deploy.sh shell api
./scripts/deploy.sh shell cora

# Clean up everything (⚠️ removes data)
./scripts/deploy.sh clean
```

## Manual Docker Compose Commands

If you prefer using Docker Compose directly:

```bash
# Start services
docker compose -f docker-compose.production.yml --env-file .env.production up -d

# Stop services
docker compose -f docker-compose.production.yml down

# View logs
docker compose -f docker-compose.production.yml logs -f

# Rebuild and restart
docker compose -f docker-compose.production.yml up -d --build

# Run migrations inside API container
docker compose -f docker-compose.production.yml exec api sh -c "pnpm db:migrate"

# Seed database
docker compose -f docker-compose.production.yml exec api sh -c "pnpm db:seed"
```

## Environment Variables Reference

### Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_PASSWORD` | ✅ | - | PostgreSQL password |
| `DATABASE_URL` | No | Auto-generated | Full PostgreSQL connection string |

### Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_JWT_SECRET` | ✅ | - | JWT signing secret (min 32 chars) |
| `AUTH_ISSUER` | No | `https://auth.certivo` | JWT issuer claim |
| `AUTH_AUDIENCE` | No | `certivo-api` | JWT audience claim |
| `AUTH_TENANT_CLAIM` | No | `tenant_id` | JWT claim for tenant ID |
| `AUTH_ROLES_CLAIM` | No | `roles` | JWT claim for user roles |
| `AUTH_EMAIL_CLAIM` | No | `email` | JWT claim for user email |
| `AUTH_JWKS_URL` | No | - | JWKS endpoint for production OAuth |

### CORA AI

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CORA_OPENAI_API_KEY` | ✅ | - | OpenAI API key |
| `CORA_OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model to use |
| `CORA_API_KEY` | No | - | Optional CORA API authentication |
| `CORA_API_TIMEOUT_MS` | No | `10000` | API timeout in milliseconds |

### Document Storage

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DOCUMENTS_SIGNING_SECRET` | ✅ | - | Secret for signed document URLs |
| `DOCUMENTS_PUBLIC_BASE_URL` | No | `http://localhost:4000` | Public API URL |
| `DOCUMENTS_DOWNLOAD_TTL_MS` | No | `300000` | Download link TTL (5 minutes) |

### Temporal Workflows

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TEMPORAL_NAMESPACE` | No | `default` | Temporal namespace |
| `TEMPORAL_SUPPLIER_TASK_QUEUE` | No | `supplier-workflows` | Supplier workflow queue |
| `TEMPORAL_INGESTION_TASK_QUEUE` | No | `ingestion-retries` | Ingestion retry queue |

### Web Application

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CERTIVO_API_URL` | No | `http://api:4000` | API URL (internal) |
| `CERTIVO_API_TOKEN` | ✅ | - | JWT token for web app |

### Logging

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOG_LEVEL` | No | `info` | Logging level (trace, debug, info, warn, error) |

## Architecture

### Service Dependencies

```
┌─────────┐
│   Web   │ ───────┐
└─────────┘        │
                   ▼
┌─────────┐    ┌─────────┐    ┌──────────┐
│  Worker │───▶│   API   │───▶│ Postgres │
└─────────┘    └─────────┘    └──────────┘
      │            │               │
      │            ▼               │
      │        ┌────────┐          │
      │        │  CORA  │──────────┘
      │        └────────┘
      │
      ▼
┌──────────┐   ┌────────┐
│ Temporal │──▶│ Redis  │
└──────────┘   └────────┘
```

### Health Checks

All services include health checks:

- **API**: GET `/healthz` (no DB) and `/readyz` (with DB)
- **CORA**: GET `/health`
- **PostgreSQL**: `pg_isready` command
- **Redis**: `redis-cli ping`
- **Temporal**: `tctl cluster health`

### Data Persistence

Docker volumes are used for persistent data:

- `pgdata` - PostgreSQL database
- `redisdata` - Redis data
- `temporaldata` - Temporal server data
- `documents` - Uploaded documents

## Database Migrations

### Running Migrations

Migrations run automatically during deployment, but you can run them manually:

```bash
# Using deploy script
./scripts/deploy.sh migrate

# Using docker exec
docker exec -it certivo-api sh -c "cd /app && pnpm db:migrate"
```

### Migration Files

Located in `infra/db/migrations/`:

1. `001_core_schema.sql` - Core tables
2. `002_views_and_functions.sql` - Views and functions
3. `003_rls_policies.sql` - Row-level security
4. `004_document_lifecycle.sql` - Document management
5. `005_search_rag.sql` - pgvector and embeddings

## Seeding Sample Data

Load sample data for testing:

```bash
# Using deploy script
./scripts/deploy.sh seed

# Using docker exec
docker exec -it certivo-api sh -c "cd /app && pnpm db:seed"
```

Sample data includes:
- ACME Corporation tenant
- Industrial Smart Hub v2 product
- Sample BOMs with components
- Supplier data (Zentech, Jinlong, EverBright)
- Sample certificates (ROHS, REACH)
- Regulation data (PFAS, RoHS, REACH)

## Monitoring and Logs

### View Logs

```bash
# All services
./scripts/deploy.sh logs

# Specific service
./scripts/deploy.sh logs api
./scripts/deploy.sh logs web
./scripts/deploy.sh logs cora
./scripts/deploy.sh logs worker

# Follow logs in real-time
docker compose -f docker-compose.production.yml logs -f api
```

### Prometheus Metrics

The API exposes Prometheus metrics at:

```
GET http://localhost:4000/metrics
```

Metrics include:
- HTTP request duration
- Request count by method/route
- Database connection pool stats
- LLM call tracking

## Troubleshooting

### Services Won't Start

```bash
# Check service status
./scripts/deploy.sh ps

# Check logs for errors
./scripts/deploy.sh logs

# Verify environment variables
cat .env.production

# Rebuild from scratch
./scripts/deploy.sh down
./scripts/deploy.sh up
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker ps | grep certivo-postgres

# Check PostgreSQL logs
docker logs certivo-postgres

# Test database connection
docker exec -it certivo-postgres psql -U certivo -d certivo -c "SELECT 1"
```

### API Health Check Failing

```bash
# Check API logs
./scripts/deploy.sh logs api

# Test health endpoint
curl http://localhost:4000/healthz

# Test readiness endpoint
curl http://localhost:4000/readyz

# Check database connectivity
docker exec -it certivo-api sh
# Inside container:
node -e "const pg = require('pg'); const client = new pg.Client(process.env.DATABASE_URL); client.connect().then(() => console.log('OK')).catch(console.error)"
```

### CORA Service Issues

```bash
# Check CORA logs
./scripts/deploy.sh logs cora

# Verify OpenAI API key
docker exec -it certivo-cora sh
# Inside container:
echo $CORA_OPENAI_API_KEY

# Test CORA health
curl http://localhost:8082/health
```

### Temporal Worker Not Processing

```bash
# Check worker logs
./scripts/deploy.sh logs worker

# Check Temporal server
docker logs certivo-temporal

# Verify Temporal connectivity
docker exec -it certivo-worker sh
# Inside container:
node -e "console.log(process.env.TEMPORAL_ADDRESS)"
```

### Out of Disk Space

```bash
# Check Docker disk usage
docker system df

# Clean up unused images
docker image prune -a

# Clean up stopped containers
docker container prune

# Clean up volumes (⚠️ removes data)
docker volume prune
```

### Complete Reset

```bash
# Stop and remove everything
./scripts/deploy.sh clean

# Remove .env.production (optional)
rm .env.production

# Start fresh
cp .env.production.example .env.production
# Edit .env.production
./scripts/deploy.sh up
```

## Security Considerations

### Production Checklist

- ✅ Use strong, random passwords for `POSTGRES_PASSWORD`
- ✅ Use a secure, 32+ character `AUTH_JWT_SECRET`
- ✅ Configure `AUTH_JWKS_URL` for OAuth in production
- ✅ Use HTTPS for `DOCUMENTS_PUBLIC_BASE_URL`
- ✅ Restrict network access (firewall rules)
- ✅ Enable Docker security scanning
- ✅ Regularly update base images
- ✅ Monitor logs for suspicious activity
- ✅ Backup database regularly
- ✅ Rotate secrets periodically

### Network Security

The default setup exposes ports to `localhost` only. For production:

1. Use a reverse proxy (nginx, Traefik) with SSL/TLS
2. Configure firewall rules
3. Use Docker network isolation
4. Enable authentication on all services

### Secrets Management

For production, consider using:
- Docker Secrets
- HashiCorp Vault
- AWS Secrets Manager
- Azure Key Vault

## Backup and Restore

### Database Backup

```bash
# Backup database
docker exec certivo-postgres pg_dump -U certivo certivo > backup.sql

# Backup with timestamp
docker exec certivo-postgres pg_dump -U certivo certivo > "backup-$(date +%Y%m%d-%H%M%S).sql"
```

### Database Restore

```bash
# Restore database
docker exec -i certivo-postgres psql -U certivo certivo < backup.sql
```

### Document Backup

```bash
# Backup documents volume
docker run --rm \
  -v certivo_documents:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/documents-backup.tar.gz -C /data .

# Restore documents
docker run --rm \
  -v certivo_documents:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/documents-backup.tar.gz -C /data
```

## Scaling Considerations

### Horizontal Scaling

To scale services horizontally:

```bash
# Scale API to 3 instances
docker compose -f docker-compose.production.yml up -d --scale api=3

# Scale worker to 2 instances
docker compose -f docker-compose.production.yml up -d --scale worker=2
```

Note: Requires load balancer (nginx, HAProxy, Traefik) in front of API.

### Vertical Scaling

Adjust resource limits in `docker-compose.production.yml`:

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

## Support

For issues or questions:
1. Check logs: `./scripts/deploy.sh logs`
2. Review troubleshooting section above
3. Check GitHub issues
4. Contact support team

## Additional Resources

- [Architecture.md](../Architecture.md) - System architecture overview
- [CLAUDE.md](../CLAUDE.md) - Development guide
- [apps/web/CLAUDE.md](../apps/web/CLAUDE.md) - Frontend-specific guide
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL pgvector](https://github.com/pgvector/pgvector)
- [Temporal Documentation](https://docs.temporal.io/)
