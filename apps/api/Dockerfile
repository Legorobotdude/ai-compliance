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

# Copy remaining workspace files (docs, configs, sample data, etc.)
COPY . .

# Build all packages
RUN pnpm build

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
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/modules ./modules
COPY --from=builder /app/libs ./libs
COPY --from=builder /app/infra ./infra
COPY --from=builder ["/app/Sample Data", "./Sample Data"]

# Create documents directory
RUN mkdir -p /app/.certivo/documents

# Expose API port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/healthz', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run the API
CMD ["node", "apps/api/dist/main.js"]
