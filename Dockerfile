# AstraDraw API - Backend service for authentication, workspace, and storage
FROM node:20-slim AS builder

ARG CHINA_MIRROR=false

# Enable China NPM mirror when CHINA_MIRROR is true
RUN if [ "$CHINA_MIRROR" = "true" ]; then \
    echo "Enable China NPM Mirror" && \
    npm install -g cnpm --registry=https://registry.npmmirror.com && \
    npm config set registry https://registry.npmmirror.com; \
    fi

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @nestjs/cli

WORKDIR /app

# Copy package files and install ALL dependencies (including dev)
COPY package.json package-lock.json ./
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source and build
COPY . .
RUN npx nest build

# Remove devDependencies (faster than npm ci --omit=dev)
RUN npm prune --omit=dev
# Re-generate Prisma client after pruning
RUN npx prisma generate


FROM node:20-slim

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/prisma /app/prisma

USER node

EXPOSE 8080

# Run migrations on startup, then start the server
ENTRYPOINT ["sh", "-c", "npx prisma db push --accept-data-loss 2>/dev/null || npx prisma migrate deploy 2>/dev/null || true; npm run start:prod"]
