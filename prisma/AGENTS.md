# Prisma Agent Instructions

Database schema and migrations for AstraDraw.

## Key Files

- `schema.prisma` - Database schema definition
- `migrations/` - Migration history

## Commands

```bash
npx prisma migrate dev --name <name>  # Create migration
npx prisma generate                    # Generate client
npx prisma studio                      # GUI browser
```

## Key Models

### User
```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  oidcId       String?  @unique  // SSO users
  passwordHash String?           // Local auth
}
```

### Workspace
```prisma
model Workspace {
  type WorkspaceType @default(PERSONAL)
  // PERSONAL = no collaboration
  // SHARED = full collaboration
}
```

### Scene
```prisma
model Scene {
  storageKey   String   @unique  // S3 key for data
  roomId       String?           // Collaboration room
  roomKeyEncrypted String?       // Encrypted room key
}
```

## Migration Tips

- **Fresh deployment**: Consolidate migrations with `rm -rf migrations/* && npx prisma migrate dev --name init`
- **Schema changes**: Always run `npx prisma generate` after schema changes

For backend patterns, see @backend-patterns
