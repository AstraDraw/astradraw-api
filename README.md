# Astradraw Storage

> **Built on top of [excalidraw-storage-backend](https://github.com/kiliandeca/excalidraw-storage-backend)** - HTTP storage backend for Excalidraw.

Self-hosted storage backend for Astradraw with PostgreSQL, MongoDB, Redis, and MySQL support.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-blue)](https://github.com/astrateam-net/astradraw-storage/pkgs/container/astradraw-storage)

## Features

- ✅ **Multiple Databases**: PostgreSQL, MongoDB, Redis, MySQL via [Keyv](https://github.com/jaredwray/keyv)
- ✅ **Docker Secrets Support**: Native `_FILE` suffix support for secrets
- ✅ **Scenes Storage**: Export as link functionality
- ✅ **Rooms Storage**: Real-time collaboration sessions
- ✅ **Files Storage**: Images and attachments
- ✅ **REST API**: Simple HTTP API compatible with Excalidraw frontend
- ✅ **Self-hosted**: Full control over your data

## Architecture

This is the storage backend component of the Astradraw suite:

- **[astradraw-app](https://github.com/astrateam-net/astradraw-app)**: Frontend application
- **astradraw-storage** (this repo): Storage backend API
- **[astradraw](https://github.com/astrateam-net/astradraw)**: Deployment configuration

## Key Modifications from Upstream

### Docker Secrets Support

Added `src/utils/secrets.ts` helper to read secrets from files:

```typescript
export function getSecret(name: string, defaultValue?: string): string | undefined
export function getSecretOrThrow(name: string): string
```

Any environment variable supports a `_FILE` suffix to read from files (Docker Swarm, Kubernetes secrets).

## Environment Variables

| Variable | Description | Default | `_FILE` Support |
|----------|-------------|---------|-----------------|
| `STORAGE_URI` | Keyv connection string | `""` (in-memory) | ✅ |
| `PORT` | Server listening port | `8080` | ✅ |
| `GLOBAL_PREFIX` | API prefix for all routes | `/api/v2` | ✅ |
| `LOG_LEVEL` | Log level | `warn` | ✅ |
| `BODY_LIMIT` | Payload size limit | `50mb` | ✅ |
| `KINESCOPE_API_KEY` | Kinescope API key for Talktrack | `""` | ✅ |
| `KINESCOPE_PROJECT_ID` | Kinescope project/folder ID | `""` | ✅ |

### Supported Databases (via Keyv)

```bash
# PostgreSQL
STORAGE_URI=postgres://user:pass@host:5432/db

# MongoDB
STORAGE_URI=mongodb://user:pass@host:27017/db

# Redis
STORAGE_URI=redis://user:pass@host:6379

# MySQL
STORAGE_URI=mysql://user:pass@host:3306/db

# In-memory (non-persistent)
STORAGE_URI=
```

## Quick Start

### Using Docker (Production)

```bash
docker run -d \
  -p 8080:8080 \
  -e STORAGE_URI=postgres://user:pass@postgres:5432/astradraw \
  ghcr.io/astrateam-net/astradraw-storage:latest
```

### Using Docker Secrets

```bash
# Create secret file
echo "postgres://user:pass@postgres:5432/astradraw" > secrets/storage_uri

# Run with secret
docker run -d \
  -p 8080:8080 \
  -e STORAGE_URI_FILE=/run/secrets/storage_uri \
  -v ./secrets:/run/secrets:ro \
  ghcr.io/astrateam-net/astradraw-storage:latest
```

### Building from Source

```bash
# Install dependencies
npm install

# Build
npm run build

# Start
npm run start:prod
```

### Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run start:dev

# Run tests
npm run test
```

## Docker Secrets Support

### Docker Swarm Example

```yaml
services:
  storage:
    image: ghcr.io/astrateam-net/astradraw-storage:latest
    environment:
      - STORAGE_URI_FILE=/run/secrets/storage_uri
    secrets:
      - storage_uri

secrets:
  storage_uri:
    external: true
```

### Kubernetes Example

```yaml
env:
  - name: STORAGE_URI_FILE
    value: /etc/secrets/storage-uri
volumeMounts:
  - name: secrets
    mountPath: /etc/secrets
    readOnly: true
volumes:
  - name: secrets
    secret:
      secretName: astradraw-storage-secrets
```

### Priority Order

1. If `VAR_NAME_FILE` is set and file exists → use file contents
2. Otherwise, if `VAR_NAME` is set → use env var
3. Otherwise → use default value

## API Endpoints

- `POST /api/v2/scenes/:id` - Save scene
- `GET /api/v2/scenes/:id` - Load scene
- `POST /api/v2/rooms/:id` - Save room
- `GET /api/v2/rooms/:id` - Load room
- `POST /api/v2/files` - Upload files
- `GET /api/v2/files/:id` - Download file
- `POST /api/v2/talktrack/upload` - Upload Talktrack video to Kinescope
- `DELETE /api/v2/talktrack/:videoId` - Delete Talktrack video from Kinescope

## Talktrack Configuration

To enable Talktrack video recording proxy (keeps API keys server-side):

```bash
# Set Kinescope credentials
KINESCOPE_API_KEY=your_api_key
KINESCOPE_PROJECT_ID=your_project_id

# Or use Docker secrets
KINESCOPE_API_KEY_FILE=/run/secrets/kinescope_api_key
KINESCOPE_PROJECT_ID_FILE=/run/secrets/kinescope_project_id
```

Get your Kinescope credentials at https://app.kinescope.io/

The frontend will automatically use the proxy if `VITE_APP_HTTP_STORAGE_BACKEND_URL` is configured. This keeps your Kinescope API key secure on the server instead of exposing it in the browser.

## Deployment

For complete deployment with frontend, database, and Traefik proxy, see the [astradraw deployment repo](https://github.com/astrateam-net/astradraw).

### Docker Compose Example

```yaml
services:
  storage:
    image: ghcr.io/astrateam-net/astradraw-storage:latest
    environment:
      - STORAGE_URI_FILE=/run/secrets/storage_uri
      - PORT=8080
      - LOG_LEVEL=log
    volumes:
      - ./secrets:/run/secrets:ro
    depends_on:
      - postgres

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=astradraw
      - POSTGRES_PASSWORD=secret
      - POSTGRES_DB=astradraw
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

## License

MIT License - Based on [excalidraw-storage-backend](https://github.com/kiliandeca/excalidraw-storage-backend)

## Links

- **Upstream**: [kiliandeca/excalidraw-storage-backend](https://github.com/kiliandeca/excalidraw-storage-backend)
- **Frontend App**: [astradraw-app](https://github.com/astrateam-net/astradraw-app)
- **Deployment**: [astradraw](https://github.com/astrateam-net/astradraw)
- **Docker Image**: [ghcr.io/astrateam-net/astradraw-storage](https://github.com/astrateam-net/astradraw-storage/pkgs/container/astradraw-storage)
