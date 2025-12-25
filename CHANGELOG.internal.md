# Changelog (Internal Development History)

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2025-12-24

### Added

- **Notification System - Phase 1 & 2: Backend Complete**
  - New Prisma model: `Notification` with types MENTION and COMMENT
  - REST API endpoints: list notifications, unread count, mark as read, mark all as read
  - Cursor-based pagination for notification list
  - NotificationsService with createMentionNotifications and createCommentNotifications methods
  - Integration with CommentsService: notifications triggered on thread/comment creation
  - MENTION notifications for @mentioned users in comments
  - COMMENT notifications for thread participants when new replies are added
  - Self-mentions and comment authors are excluded from notifications

## [0.8.0] - 2025-12-23

### Added

- **Comment System - Phase 1: Backend Foundation**
  - New Prisma models: `CommentThread` (canvas anchor) and `Comment` (individual messages)
  - Full CRUD REST API for comment threads and comments
  - Thread operations: create, list, get, update position, delete, resolve, reopen
  - Comment operations: add reply, edit, delete
  - Permission guards: VIEW for reading, EDIT for creating/modifying, ADMIN/owner for deletion
  - Field filtering support via `?fields=` query parameter
  - Cascade delete: deleting a scene removes all threads and comments

## [0.7.6] - 2025-12-22

### Fixed

- **Super Admin Promotion on SSO Login**
  - Users listed in `SUPERADMIN_EMAILS` are now automatically promoted to super admin when they log in via SSO/OIDC
  - Previously, super admin promotion only happened at API startup, which didn't work for users who hadn't logged in yet
  - New `promoteIfConfiguredSuperAdmin()` method checks and promotes users during OIDC authentication
  - Existing users will be promoted on their next SSO login

## [0.7.5] - 2025-12-22

### Added

- **Complete Docker Secrets Support**
  - All sensitive configuration now supports `_FILE` suffix for Docker secrets
  - New `database-url.ts` utility builds DATABASE_URL from individual secrets
  - Supports external PostgreSQL via `POSTGRES_HOST` and `POSTGRES_PORT`
  - Updated `auth.module.ts`, `auth.service.ts`, `jwt.strategy.ts` to use `getSecret()`
  - Updated `workspace-scenes.controller.ts` to use `getSecret()` for S3 config

- **Supported Secrets**
  - `POSTGRES_USER_FILE`, `POSTGRES_PASSWORD_FILE`, `POSTGRES_DB_FILE`
  - `DATABASE_URL_FILE` (alternative to individual credentials)
  - `JWT_SECRET_FILE`, `ROOM_KEY_SECRET_FILE`
  - `OIDC_ISSUER_URL_FILE`, `OIDC_CLIENT_ID_FILE`, `OIDC_CLIENT_SECRET_FILE`
  - `OIDC_CALLBACK_URL_FILE`, `OIDC_INTERNAL_URL_FILE`
  - `ADMIN_USERNAME_FILE`, `ADMIN_PASSWORD_FILE`, `ADMIN_EMAIL_FILE`
  - `SUPERADMIN_EMAILS_FILE`

### Changed

- `OIDC_CALLBACK_URL` now auto-generates from `APP_URL` if not explicitly set
- `PrismaService` now uses `getDatabaseUrl()` for dynamic connection string

## [0.7.0] - 2025-12-21

### Added

- **Collaboration Permissions System**
  - `SceneAccessService` for unified permission checking across workspace → collection → team → scene
  - Returns `{ canView, canEdit, canCollaborate }` based on workspace type and user roles
  - Personal workspaces: owner-only access, no collaboration
  - Shared workspaces: role-based + team-based access control
  
- **Workspace Types**
  - New `WorkspaceType` enum: `PERSONAL` (default) / `SHARED`
  - Personal workspaces cannot have members, teams, or collaboration
  - Shared workspaces support full team collaboration
  - `WorkspacesService.requireSharedWorkspace()` guards team operations
  
- **Super Admin Role**
  - New `isSuperAdmin` Boolean field on User model
  - Bootstrap from `SUPERADMIN_EMAILS` environment variable (comma-separated)
  - Super admins automatically flagged on login/registration
  
- **Collection Access Levels**
  - New `CollectionAccessLevel` enum: `VIEW` / `EDIT`
  - Replaces boolean `TeamCollection.canWrite`
  - `TeamsService` returns `{ collectionId, canWrite }` based on access level
  - More flexible for future access level expansion
  
- **Scene Collaboration Features**
  - `Scene.collaborationEnabled` Boolean (default true)
  - `Scene.roomKeyEncrypted` String for encrypted room credentials
  - Room key encryption using AES-256-GCM with `ROOM_KEY_SECRET` or `JWT_SECRET`

---

**Note:** This is the internal development changelog. See CHANGELOG.md for the public release history.

