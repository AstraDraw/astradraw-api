FROM node:20-alpine AS builder

ARG CHINA_MIRROR=false

# enable china mirror when ENABLE_CHINA_MIRROR is true
RUN if [[ "$CHINA_MIRROR" = "true" ]] ; then \
    echo "Enable China Alpine Mirror" && \
    sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories; \
    fi

RUN if [[ "$CHINA_MIRROR" = "true" ]] ; then \
    echo "Enable China NPM Mirror" && \
    npm install -g cnpm --registry=https://registry.npmmirror.com; \
    npm config set registry https://registry.npmmirror.com; \
    fi

RUN apk add --update python3 make g++ curl openssl
RUN npm install -g eslint
RUN npm install -g @nestjs/cli

WORKDIR /app

COPY package.json .
COPY package-lock.json .
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npx nest build

# Remove devDependencies for smaller image
RUN npm ci --omit=dev
# Re-generate Prisma client after removing devDependencies
RUN npx prisma generate


FROM node:20-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/prisma /app/prisma

USER node

EXPOSE 8080

# Run migrations on startup, then start the server
ENTRYPOINT ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
