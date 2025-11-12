# Docker Compose

Local services for the modular monolith live here. Bring up Postgres (pgvector-enabled) and Redis with:

```sh
cd infra/docker
docker compose up -d
```

Defaults:

- Postgres: `postgres://certivo:certivo@localhost:5432/certivo`
- Redis: `redis://localhost:6379`

After containers are healthy run migrations (from the repo root):

```sh
pnpm db:migrate
```

Then load the sample tenant/BOM/certificates for local development:

```sh
pnpm db:seed
```

Re-seeding/minio/Temporal services can be layered on later by extending `docker-compose.yml`.
