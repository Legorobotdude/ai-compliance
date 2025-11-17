# Infrastructure

This directory contains infrastructure-related files for Certivo deployment and management.

## Directory Structure

```
infra/
├── db/
│   └── migrations/       # SQL migration files
├── docker/
│   ├── docker-compose.yml           # Development infrastructure (Postgres + Redis)
│   └── generate-dev-token.mjs       # JWT token generator for development
└── README.md            # This file
```

## Development Infrastructure

The `docker/docker-compose.yml` file provides local infrastructure services:

- **PostgreSQL** with pgvector extension (port 5432)
- **Redis** for queues and caching (port 6379)

### Start Development Infrastructure

```bash
cd infra/docker
docker compose up -d
```

This starts only the database and Redis. Application services (API, Web, CORA, Worker) run via `pnpm dev`.

## Production Deployment

Production deployment files are located in the repository root:

- `docker-compose.production.yml` - Full production stack
- `.env.production.example` - Production environment template
- `scripts/deploy.sh` - Deployment automation script
- `apps/*/Dockerfile` - Service-specific Dockerfiles

### Deploy to Production

```bash
# Copy environment template
cp .env.production.example .env.production

# Edit with your production values
nano .env.production

# Generate API token
node infra/docker/generate-dev-token.mjs

# Deploy all services
./scripts/deploy.sh up
```

See [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) for complete production deployment guide.

## Database Migrations

Migrations are located in `db/migrations/` and run automatically during deployment.

### Run Migrations Manually

```bash
# Development
pnpm db:migrate

# Production
./scripts/deploy.sh migrate
```

### Migration Files

1. `001_core_schema.sql` - Core tables (tenants, users, BOMs, suppliers, certificates)
2. `002_views_and_functions.sql` - Views and helper functions
3. `003_rls_policies.sql` - Row-level security policies
4. `004_document_lifecycle.sql` - Document management
5. `005_search_rag.sql` - pgvector and embeddings for semantic search

## JWT Token Generation

The `generate-dev-token.mjs` script creates JWT tokens for development and testing.

### Generate Token

```bash
node infra/docker/generate-dev-token.mjs
```

This generates a JWT token with:
- Tenant: ACME Corporation
- User: ops@acme.example.com
- Role: ADMIN
- Validity: 30 days

Use this token in:
- `.dev.env` as `CERTIVO_API_TOKEN` (development)
- `.env.production` as `CERTIVO_API_TOKEN` (production)

## Environment Comparison

| Environment | Infrastructure | App Services | Configuration |
|-------------|---------------|--------------|---------------|
| **Development** | `infra/docker/docker-compose.yml` | `pnpm dev` | `.dev.env` |
| **Production** | `docker-compose.production.yml` | `docker-compose.production.yml` | `.env.production` |

### Development Setup

```bash
# 1. Start infrastructure
cd infra/docker && docker compose up -d

# 2. Run migrations
pnpm db:migrate

# 3. Seed data
pnpm db:seed

# 4. Generate token
node infra/docker/generate-dev-token.mjs

# 5. Configure environment
cp .dev.env.example .dev.env
# Edit .dev.env with token and OpenAI key

# 6. Start services
pnpm dev
```

### Production Setup

```bash
# 1. Configure environment
cp .env.production.example .env.production
# Edit .env.production with production values

# 2. Generate token
node infra/docker/generate-dev-token.mjs

# 3. Deploy
./scripts/deploy.sh up
```

## Troubleshooting

### Development Infrastructure Issues

```bash
# Check container status
cd infra/docker
docker compose ps

# View logs
docker compose logs

# Restart containers
docker compose restart

# Clean reset
docker compose down -v
docker compose up -d
```

### Database Connection Issues

```bash
# Test PostgreSQL connection
docker exec -it certivo-postgres psql -U certivo -d certivo -c "SELECT 1"

# Check PostgreSQL logs
docker logs certivo-postgres

# Verify port is available
lsof -i :5432
```

### Redis Issues

```bash
# Test Redis connection
docker exec -it certivo-redis redis-cli ping

# Check Redis logs
docker logs certivo-redis
```

## Additional Resources

- [CLAUDE.md](../CLAUDE.md) - Development guide
- [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) - Production deployment guide
- [Architecture.md](../docs/Architecture.md) - System architecture
