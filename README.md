# AstraDraw API

> **Built on top of [excalidraw-storage-backend](https://github.com/kiliandeca/excalidraw-storage-backend)** - Extended with authentication, workspaces, and more.

Backend API for AstraDraw providing user authentication, personal workspaces, video recording management, and scene storage.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-blue)](https://github.com/astrateam-net/astradraw-api/pkgs/container/astradraw-api)

## Features

- 👤 **User Authentication** - Local accounts with email/password + OIDC/SSO support
- 📁 **Personal Workspaces** - Save, organize, and manage scenes per user
- 🎬 **Talktrack** - Video recording metadata with Kinescope integration
- 👤 **User Profiles** - Avatar upload, name editing
- 💾 **Flexible Storage** - S3/MinIO or PostgreSQL/MongoDB via Keyv
- 🔐 **Docker Secrets** - Native `_FILE` suffix support for secrets
- 🔒 **JWT Authentication** - HTTP-only cookies for security

## Architecture

This is the backend API component of the AstraDraw suite:

- **[astradraw-app](https://github.com/astrateam-net/astradraw-app)**: Frontend application
- **astradraw-api** (this repo): Backend API
- **[astradraw-room](https://github.com/astrateam-net/astradraw-room)**: WebSocket collaboration server
- **[astradraw](https://github.com/astrateam-net/astradraw)**: Deployment configuration & documentation

## Tech Stack

- **NestJS** - Node.js framework
- **Prisma** - Database ORM
- **PostgreSQL** - User data, scenes metadata, recordings
- **MinIO/S3** - Scene content, files, rooms
- **JWT** - Authentication tokens

## Quick Start

### Using Docker (Production)

```bash
docker run -d \
  -p 8080:8080 \
  -e DATABASE_URL=postgres://user:pass@postgres:5432/astradraw \
  -e STORAGE_BACKEND=s3 \
  -e S3_ENDPOINT=http://minio:9000 \
  -e S3_ACCESS_KEY=minioadmin \
  -e S3_SECRET_KEY=minioadmin \
  -e JWT_SECRET=your-secret-key \
  ghcr.io/astrateam-net/astradraw-api:latest
```

### Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run start:dev

# Run checks before committing
npm run build          # Build + TypeScript
npm run format         # Prettier
npm run lint           # ESLint
npm run test           # Unit tests
```

## Environment Variables

### Core

| Variable | Description | Default | `_FILE` Support |
|----------|-------------|---------|-----------------|
| `PORT` | Server port | `8080` | ✅ |
| `GLOBAL_PREFIX` | API prefix | `/api/v2` | ✅ |
| `LOG_LEVEL` | Log level | `warn` | ✅ |
| `JWT_SECRET` | JWT signing secret | (required) | ✅ |
| `JWT_EXPIRATION` | Token expiration | `7d` | ❌ |

### Database (Prisma)

| Variable | Description | `_FILE` Support |
|----------|-------------|-----------------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |

### Storage (S3/MinIO)

| Variable | Description | Default | `_FILE` Support |
|----------|-------------|---------|-----------------|
| `STORAGE_BACKEND` | `s3` or `keyv` | `s3` | ❌ |
| `S3_ENDPOINT` | S3/MinIO endpoint | (required) | ✅ |
| `S3_ACCESS_KEY` | Access key | (required) | ✅ |
| `S3_SECRET_KEY` | Secret key | (required) | ✅ |
| `S3_BUCKET` | Bucket name | `excalidraw` | ✅ |
| `S3_REGION` | Region | `us-east-1` | ✅ |

### Authentication

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_LOCAL_ENABLED` | Enable local auth | `true` |
| `AUTH_LOCAL_REGISTRATION` | Allow registration | `true` |
| `AUTH_OIDC_ENABLED` | Enable OIDC/SSO | `false` |
| `OIDC_ISSUER_URL` | OIDC provider URL | - |
| `OIDC_CLIENT_ID` | OIDC client ID | - |
| `OIDC_CLIENT_SECRET` | OIDC client secret | - |
| `OIDC_INTERNAL_URL` | Internal OIDC URL (Docker) | - |

### Talktrack (Kinescope)

| Variable | Description | `_FILE` Support |
|----------|-------------|-----------------|
| `KINESCOPE_API_KEY` | Kinescope API key | ✅ |
| `KINESCOPE_PROJECT_ID` | Kinescope project ID | ✅ |

## API Endpoints

### Authentication

```
GET  /api/v2/auth/status     - Check auth configuration
POST /api/v2/auth/login      - Local login
POST /api/v2/auth/register   - Local registration
GET  /api/v2/auth/login      - Start OIDC flow
GET  /api/v2/auth/callback   - OIDC callback
POST /api/v2/auth/logout     - Logout
GET  /api/v2/auth/me         - Get current user
```

### Workspace

```
GET    /api/v2/workspace/scenes           - List user's scenes
POST   /api/v2/workspace/scenes           - Create scene
GET    /api/v2/workspace/scenes/:id       - Get scene metadata
PUT    /api/v2/workspace/scenes/:id       - Update scene
DELETE /api/v2/workspace/scenes/:id       - Delete scene
GET    /api/v2/workspace/scenes/:id/data  - Get scene content
PUT    /api/v2/workspace/scenes/:id/data  - Save scene content
```

### User Profile

```
GET  /api/v2/users/me         - Get profile
PUT  /api/v2/users/me         - Update profile (name)
POST /api/v2/users/me/avatar  - Upload avatar
```

### Talktrack

```
GET    /api/v2/workspace/scenes/:id/talktracks  - List recordings
POST   /api/v2/workspace/scenes/:id/talktracks  - Create recording
PUT    /api/v2/talktracks/:id                   - Update recording
DELETE /api/v2/talktracks/:id                   - Delete recording
POST   /api/v2/talktrack/upload                 - Upload to Kinescope
DELETE /api/v2/talktrack/:videoId              - Delete from Kinescope
```

### Storage (Legacy/Collaboration)

```
POST /api/v2/scenes/:id  - Save scene
GET  /api/v2/scenes/:id  - Load scene
POST /api/v2/rooms/:id   - Save room
GET  /api/v2/rooms/:id   - Load room
POST /api/v2/files       - Upload files
GET  /api/v2/files/:id   - Download file
```

## Database Schema

```prisma
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  name          String
  passwordHash  String?   // null for SSO-only users
  oidcId        String?   @unique
  oidcProvider  String?
  avatarUrl     String?   @db.Text
  scenes        Scene[]
  recordings    TalktrackRecording[]
}

model Scene {
  id          String    @id @default(uuid())
  name        String
  storageKey  String    @unique
  userId      String
  user        User      @relation(...)
  recordings  TalktrackRecording[]
}

model TalktrackRecording {
  id              String    @id @default(uuid())
  name            String
  kinescopeId     String
  duration        Int?
  thumbnailUrl    String?
  sceneId         String
  userId          String
}
```

## Deployment

For complete deployment with frontend, database, and Traefik proxy, see the [astradraw deployment repo](https://github.com/astrateam-net/astradraw).

## License

MIT License - Based on [excalidraw-storage-backend](https://github.com/kiliandeca/excalidraw-storage-backend)

## Links

- **Main Repo**: [astradraw](https://github.com/astrateam-net/astradraw)
- **Frontend App**: [astradraw-app](https://github.com/astrateam-net/astradraw-app)
- **Room Server**: [astradraw-room](https://github.com/astrateam-net/astradraw-room)
- **Upstream**: [kiliandeca/excalidraw-storage-backend](https://github.com/kiliandeca/excalidraw-storage-backend)
- **Docker Image**: [ghcr.io/astrateam-net/astradraw-api](https://github.com/astrateam-net/astradraw-api/pkgs/container/astradraw-api)
