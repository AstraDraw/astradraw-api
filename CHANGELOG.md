# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2025-12-20

### Added

- **Workspace Feature (MVP)**
  - OIDC Authentication with Passport.js
  - JWT-based session management with HTTP-only cookies
  - PostgreSQL database integration via Prisma ORM
  
- **User Management**
  - `UsersModule` and `UsersService` for user operations
  - User creation/update from OIDC provider (Authentik)
  
- **Workspace Scenes API**
  - `GET /api/v2/workspace/scenes` - List user's scenes
  - `GET /api/v2/workspace/scenes/:id` - Get scene metadata
  - `GET /api/v2/workspace/scenes/:id/data` - Get scene data
  - `POST /api/v2/workspace/scenes` - Create new scene
  - `PUT /api/v2/workspace/scenes/:id` - Update scene
  - `PUT /api/v2/workspace/scenes/:id/data` - Update scene data only
  - `DELETE /api/v2/workspace/scenes/:id` - Delete scene
  - `POST /api/v2/workspace/scenes/:id/collaborate` - Start collaboration
  
- **Auth Endpoints**
  - `GET /api/v2/auth/status` - Check OIDC configuration
  - `GET /api/v2/auth/login` - Initiate OIDC login
  - `GET /api/v2/auth/callback` - OIDC callback handler
  - `GET /api/v2/auth/me` - Get current user
  - `GET /api/v2/auth/logout` - Logout user

- **Database Schema**
  - `users` table with OIDC integration
  - `scenes` table with S3 storage reference
  - `collections` table for organizing scenes
  
- **New Dependencies**
  - `@prisma/client` and `prisma` for database
  - `@nestjs/passport`, `@nestjs/jwt` for authentication
  - `passport-jwt` for JWT strategy
  - `openid-client` for OIDC
  - `cookie-parser` for cookie handling

### Changed

- Updated Dockerfile for Prisma client generation
- Entrypoint now runs migrations before starting server

## [0.2.5] - 2025-12-20

### Added

- **Video Status Endpoint**
  - `GET /api/v2/talktrack/:videoId/status` - Check video processing status
  - Returns processing state: `processing`, `ready`, or `error`
  - Includes original Kinescope status for debugging

### Fixed

- Corrected status mapping: Kinescope uses `"done"` not `"ready"` for processed videos
- Improved error handling for status checks

### Changed

- Enhanced logging for video status checks
- Return both mapped status and original Kinescope status in response

## [0.2.4] - 2025-12-20

### Added

- **Talktrack Video Proxy** for Kinescope API
  - New `TalktrackController` with upload and delete endpoints
  - `POST /api/v2/talktrack/upload` - Proxy video uploads to Kinescope
  - `DELETE /api/v2/talktrack/:videoId` - Proxy video deletions from Kinescope
  - Keeps Kinescope API key secure on server-side (not exposed to browser)
  - Support for `KINESCOPE_API_KEY` and `KINESCOPE_PROJECT_ID` environment variables
  - Docker secrets support via `_FILE` suffix for both Kinescope credentials
  - Unit tests for TalktrackController

### Changed

- Added `axios` dependency for HTTP requests to external APIs
- Updated README with Talktrack configuration documentation

### Technical

- Frontend automatically uses proxy when `VITE_APP_HTTP_STORAGE_BACKEND_URL` is configured
- Backward compatible - direct browser upload still works if proxy not configured

## [0.2.3] - 2025-12-19

### Changed

- Increased default body limit to 200MB and ensured consistency with frontend and room server limits.

## [0.2.1] - 2024-12-19

### Changed

- Changed missing resource response from 404 to 204 No Content for rooms and files to prevent console error logs.

## [0.2.0] - 2024-12-18

### Added

- S3-compatible storage support (MinIO, AWS S3, etc.)
- Pluggable storage architecture with `IStorageService` interface
- `S3StorageService` using `@aws-sdk/client-s3`
- `StorageModule` with dynamic provider selection via `STORAGE_BACKEND` env var
- Docker secrets support for S3 credentials (`_FILE` suffix pattern)
- `package.optional.json` for unused Keyv adapters

### Changed

- Refactored `StorageService` to `KeyvStorageService`
- Updated NestJS to 10.4.17 and all dependencies to latest versions
- Dockerfile build order: full install → build → prune dev deps

### Removed

- Unused Keyv adapters moved to `package.optional.json` (MongoDB, Redis, SQLite, MySQL)

## [0.1.0] - 2024-12-15

### Added

- Initial release based on excalidraw-storage-backend
- PostgreSQL support via Keyv
- Docker secrets support for `STORAGE_URI`
- Multi-arch Docker images (amd64, arm64)
- GitHub Actions workflow for automated releases
