# Changelog

All notable changes to AstraDraw API (Backend) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-12-25

### Added

**Authentication**
- OIDC/SSO authentication support (Authentik, Keycloak, Dex, any OIDC provider)
- Local authentication with email/password
- JWT tokens in HTTP-only cookies
- Super admin role for instance management
- User registration with optional email verification

**Workspaces & Organization**
- Personal workspaces (owner-only access)
- Shared workspaces with team collaboration
- Collections for organizing scenes
- Teams with role-based permissions (Admin/Member/Viewer)
- Invite links for workspace sharing

**Scenes & Storage**
- Scene CRUD operations with metadata
- S3/MinIO storage backend for scene data
- Scene thumbnails generation
- Room key encryption for collaboration

**Comments & Notifications**
- Comment threads anchored to canvas elements
- @mentions in comments
- Notification system for mentions and replies
- Real-time comment sync via WebSocket events

**User Management**
- User profiles with avatar upload
- Profile editing (name, avatar)
- Workspace membership management

**Talktrack**
- Video recording metadata storage
- Kinescope integration for video hosting

**Infrastructure**
- Docker secrets support (`_FILE` suffix pattern)
- Prisma ORM with PostgreSQL
- Health check endpoints

### Based On

This backend is inspired by [excalidraw-storage-backend](https://github.com/alswl/excalidraw-storage-backend).

**Original License:** MIT License © 2022 Kilian Decaderincourt

