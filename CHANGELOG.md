# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2025-12-19

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
