# Build stage
FROM node:20-bullseye-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate

WORKDIR /app

# Copy workspace sources required for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY modules ./modules
COPY libs ./libs

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy remaining workspace files (docs, configs, etc.)
COPY . .

# Build workspace packages first
RUN pnpm --filter @certivo/web^... build

# Build Next.js app
RUN pnpm --filter @certivo/web build

# Production stage
FROM node:20-bullseye-slim

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate

WORKDIR /app

# Copy workspace sources required for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY modules ./modules
COPY libs ./libs

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files from builder
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/next.config.mjs ./apps/web/
COPY --from=builder /app/libs ./libs

# Expose web port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 0

# Set NODE_ENV to production
ENV NODE_ENV=production

# Run Next.js
CMD ["pnpm", "--filter", "@certivo/web", "start"]
