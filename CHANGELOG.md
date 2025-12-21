# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.1] - 2025-12-21

### Changed

- **Personal Workspace Naming**
  - Default workspace now named `"{Username}'s Workspace"` instead of "My Workspace"
  - Username extracted and capitalized from email (e.g., "John's Workspace" for john@example.com)

## [0.6.0] - 2025-12-21

### Added

- **Workspaces Module**
  - Multi-workspace support with `Workspace` model
  - `WorkspaceMember` model with role-based access (ADMIN, MEMBER, VIEWER)
  - `InviteLink` model for shareable workspace invitations
  - `WorkspacesController` with endpoints:
    - `GET /api/v2/workspaces` - List user's workspaces
    - `GET /api/v2/workspaces/:id` - Get workspace details
    - `POST /api/v2/workspaces` - Create workspace
    - `PUT /api/v2/workspaces/:id` - Update workspace (admin)
    - `DELETE /api/v2/workspaces/:id` - Delete workspace (admin)
    - `GET /api/v2/workspaces/:id/members` - List members
    - `POST /api/v2/workspaces/:id/members/invite` - Invite by email (admin)
    - `PUT /api/v2/workspaces/:id/members/:memberId` - Update role (admin)
    - `DELETE /api/v2/workspaces/:id/members/:memberId` - Remove member
    - `GET /api/v2/workspaces/:id/invite-links` - List invite links (admin)
    - `POST /api/v2/workspaces/:id/invite-links` - Create invite link (admin)
    - `DELETE /api/v2/workspaces/:id/invite-links/:linkId` - Delete link (admin)
    - `POST /api/v2/workspaces/join` - Join via invite code
  - `WorkspaceRoleGuard` for role-based access control

- **Teams Module**
  - `Team` model with name and color
  - `TeamMember` model for user-team associations
  - `TeamCollection` model for team-collection access
  - `TeamsController` with endpoints:
    - `GET /api/v2/workspaces/:id/teams` - List teams
    - `POST /api/v2/workspaces/:id/teams` - Create team (admin)
    - `GET /api/v2/teams/:id` - Get team details
    - `PUT /api/v2/teams/:id` - Update team (admin)
    - `DELETE /api/v2/teams/:id` - Delete team (admin)

- **Collections Module**
  - `Collection` model with name, icon, privacy settings
  - Private collections visible only to owner
  - Team-based collection access
  - `CollectionsController` with endpoints:
    - `GET /api/v2/workspaces/:id/collections` - List accessible collections
    - `POST /api/v2/workspaces/:id/collections` - Create collection (admin)
    - `GET /api/v2/collections/:id` - Get collection details
    - `PUT /api/v2/collections/:id` - Update collection (admin)
    - `DELETE /api/v2/collections/:id` - Delete collection (admin)

- **Default Workspace Creation**
  - New users automatically get a default workspace on signup
  - Default "Private" collection created with 🔒 icon
  - User added as ADMIN to their default workspace

### Changed

- `UsersService` now creates default workspace for new users
- `AuthService.authenticateLocal` ensures user has workspace on login
- Database schema extended with workspace/team/collection models

### Database Migration

- Added `Workspace`, `WorkspaceMember`, `Team`, `TeamMember`, `TeamCollection`, `InviteLink` models
- Added `collectionId` to `Scene` model
- Added `WorkspaceRole` enum (ADMIN, MEMBER, VIEWER)

## [0.5.3] - 2025-12-21

### Fixed

- **Duplicate API Prefix Bug**
  - Fixed `UsersController` routes mapped to `/api/v2/api/v2/users/me`
  - Changed `@Controller('api/v2/users')` to `@Controller('users')` since global prefix already set
  - Routes now correctly mapped to `/api/v2/users/me`

- **User Profile `req.user.sub` Bug**
  - Fixed `getProfile` returning undefined user ID
  - Changed `req.user.sub` to `req.user.id` (JWT strategy returns full User object)

- **Multipart Upload Bug**
  - Excluded avatar upload route from `RawParserMiddleware`
  - Fixed "Multipart: Unexpected end of form" error on avatar upload

- **ESLint Errors**
  - Removed unused imports across multiple files
  - Fixed `passwordHash` unused variable warnings with eslint-disable comments

## [0.5.2] - 2025-12-20

### Added

- **User Profile Management API**
  - New `UsersController` with profile endpoints:
    - `GET /api/v2/users/me` - Get current user's profile
    - `PUT /api/v2/users/me` - Update profile (name, avatar)
    - `POST /api/v2/users/me/avatar` - Upload avatar image
    - `PUT /api/v2/users/me/avatar/delete` - Delete avatar
  - Avatar stored as base64 data URL in database
  - File validation (JPEG, PNG, GIF, WebP, max 2MB)
  - Password hash excluded from profile responses

- **UsersService Extensions**
  - `updateProfile(userId, data)` - Update user name/avatar
  - `getProfile(userId)` - Get profile without sensitive data

### Security

- All profile endpoints require JWT authentication
- Password hash never exposed in API responses

## [0.5.1] - 2025-12-20

### Added

- **OIDC Internal URL Support**
  - New `OIDC_INTERNAL_URL` environment variable for Docker deployments
  - Allows OIDC discovery via internal Docker network (e.g., `http://dex:5556/dex`)
  - Falls back to `OIDC_ISSUER_URL` if not set
  - Enables testing with Dex OIDC provider in Docker Compose

## [0.5.0] - 2025-12-20

### Added

- **Scene-Specific Talktrack Storage**
  - New `TalktrackRecording` model in Prisma schema
  - Recordings linked to scenes and users (foreign keys with cascade delete)
  - New `SceneTalktrackController` with CRUD endpoints:
    - `GET /workspace/scenes/:sceneId/talktracks` - List recordings
    - `POST /workspace/scenes/:sceneId/talktracks` - Create recording
    - `PUT /workspace/scenes/:sceneId/talktracks/:id` - Update recording
    - `DELETE /workspace/scenes/:sceneId/talktracks/:id` - Delete recording
    - `PUT /workspace/scenes/:sceneId/talktracks/:id/status` - Update status
  
- **Permission System**
  - Scene owner: full CRUD access to recordings
  - Shared viewers (public scenes): read-only access
  - Automatic Kinescope video deletion when recording is deleted

### Changed

- Consolidated all database migrations into single `20251220000000_init` migration
- Migration now includes: users, scenes, collections, and talktrack_recordings tables

### Database

- New `talktrack_recordings` table with indexes on `sceneId` and `userId`
- Unique constraint on `kinescopeVideoId`

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
