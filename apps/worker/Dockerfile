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
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/modules ./modules
COPY --from=builder /app/libs ./libs

# Run the worker
CMD ["node", "apps/worker/dist/main.js"]
