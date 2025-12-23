# AstraDraw API - AI Context

> This is the backend API component of [AstraDraw](https://github.com/astrateam-net/astradraw), a self-hosted Excalidraw fork.

## Project Structure

NestJS application with modular architecture:

```
src/
├── auth/              # Authentication (JWT, OIDC, local)
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── jwt.guard.ts   # ⚠️ Note: jwt.guard.ts, NOT jwt-auth.guard.ts
│   └── jwt.strategy.ts
├── users/             # User profile management
├── workspaces/        # Workspace management (multi-tenant)
├── workspace/         # Scene management (CRUD, data storage)
├── teams/             # Team management
├── collections/       # Collection management
├── comments/          # Comment threads on scenes
├── talktrack/         # Video recording metadata
├── storage/           # S3/MinIO storage abstraction
├── prisma/            # Database service
├── scenes/            # Legacy scene storage (collaboration)
├── rooms/             # Legacy room storage (collaboration)
└── files/             # Legacy file storage (collaboration)
```

## Critical Patterns

### Authentication

- JWT tokens stored in HTTP-only cookies
- Use `@UseGuards(JwtAuthGuard)` for protected routes
- Import guard from `../auth/jwt.guard` (not jwt-auth.guard)

### Database

- Use Prisma for all database operations
- Schema at `prisma/schema.prisma`
- Run `npx prisma migrate dev` for schema changes

### File Uploads

- Requires `@types/multer` in devDependencies
- Use `@UseInterceptors(FileInterceptor('file'))`

### Docker Secrets

All sensitive env vars support `_FILE` suffix:

```typescript
import { getSecret } from './utils/secrets';
const apiKey = getSecret('API_KEY'); // Checks API_KEY_FILE first
```

## Development Commands

```bash
npm install            # Install dependencies
npm run start:dev      # Start dev server with hot reload

# Before committing (or use `just check-backend` from main repo):
npm run build          # Build (includes TypeScript)
npm run format         # Prettier formatting
npm run lint           # ESLint code quality
```

## Key Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Application entry point |
| `prisma/schema.prisma` | Database schema |
| `src/auth/jwt.guard.ts` | JWT authentication guard |
| `src/storage/storage.service.ts` | S3/MinIO storage abstraction |
| `src/utils/secrets.ts` | Docker secrets helper |

## API Routes

### Authentication (`/api/v2/auth/`)
- `GET /status` - Auth configuration
- `POST /register` - Local registration
- `POST /login/local` - Local login
- `GET /login` - OIDC login flow
- `GET /callback` - OIDC callback
- `GET /me` - Current user

### Workspace (`/api/v2/workspace/scenes/`)
- `GET /` - List user's scenes
- `POST /` - Create scene
- `GET /:id` - Get scene metadata
- `PUT /:id` - Update scene
- `DELETE /:id` - Delete scene
- `GET /:id/data` - Get scene content
- `PUT /:id/data` - Save scene content

### User Profile (`/api/v2/users/`)
- `GET /me` - Get profile
- `PUT /me` - Update profile
- `POST /me/avatar` - Upload avatar

## Database Schema

Key models in `prisma/schema.prisma`:
- `User` - User accounts (local + OIDC)
- `Workspace` - Workspace with type (PERSONAL/SHARED)
- `WorkspaceMember` - User membership with role (ADMIN/MEMBER/VIEWER)
- `Team` - Team within workspace
- `Collection` - Scene collections
- `Scene` - Scene metadata (linked to S3 storage)
- `TalktrackRecording` - Video recording metadata
- `CommentThread` - Comment threads anchored to scene elements
- `Comment` - Individual comments within threads
