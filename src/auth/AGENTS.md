# Auth Agent Instructions

Authentication system for AstraDraw API.

## Key Files

- `auth.controller.ts` - Login/logout endpoints
- `auth.service.ts` - Auth logic
- `jwt.guard.ts` - JWT protection (NOT jwt-auth.guard.ts!)
- `jwt.strategy.ts` - JWT validation

## Critical: Guard Import

```typescript
// CORRECT
import { JwtAuthGuard } from '../auth/jwt.guard';

// WRONG - causes build failure
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
```

## Protecting Endpoints

```typescript
@Get('me')
@UseGuards(JwtAuthGuard)
async getProfile(@Request() req: any) {
  const userId = req.user.sub;  // User ID from JWT
}
```

## Auth Methods

- **OIDC/SSO**: External identity provider (Dex, Keycloak, etc.)
- **Local**: Email/password with bcrypt hash

## Environment Variables

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | JWT signing key |
| `OIDC_ISSUER_URL` | External OIDC URL |
| `OIDC_INTERNAL_URL` | Internal Docker URL |
| `OIDC_CLIENT_ID` | OIDC client ID |
| `OIDC_CLIENT_SECRET` | OIDC client secret |

For common issues, see @common-issues-backend
