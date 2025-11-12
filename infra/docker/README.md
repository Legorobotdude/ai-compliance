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

### Auth/JWT configuration

The API expects real OAuth2.1 tokens, but for local dev you can use an HMAC secret:

```sh
export AUTH_JWT_SECRET="dev-secret"
export AUTH_ISSUER="https://auth.dev.certivo"
export AUTH_AUDIENCE="certivo-api"
```

#### Generating JWT tokens for local development

After seeding the database, generate a JWT token with the seeded tenant ID:

```sh
# From the repo root
node infra/docker/generate-dev-token.mjs
```

This will output a JWT token that you can use as `CERTIVO_API_TOKEN` for the web app.

The script uses the same deterministic UUID function as the seed script, so it will match the tenant created by `pnpm db:seed`.

**Custom values:**
```sh
TENANT_ID=<uuid> ISSUER=<issuer> AUDIENCE=<audience> SECRET=<secret> node infra/docker/generate-dev-token.mjs
```

**Default values (matching seed script):**
- Tenant ID: Deterministic UUID from `'tenant:acme'`
- User ID: Deterministic UUID from `'user:ops@acme.example.com'`
- Email: `ops@acme.example.com`
- Roles: `['ADMIN']`
- Issuer: `https://auth.dev.certivo`
- Audience: `certivo-api`
- Secret: `dev-secret`

Re-seeding/minio/Temporal services can be layered on later by extending `docker-compose.yml`.
