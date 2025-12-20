import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkspaceRole } from '@prisma/client';
import { WorkspacesService } from './workspaces.service';

export const REQUIRED_ROLE_KEY = 'requiredRole';
export const RequireRole = (role: WorkspaceRole) =>
  SetMetadata(REQUIRED_ROLE_KEY, role);

/**
 * Guard that checks if the user has the required role in the workspace.
 * The workspaceId is extracted from route params (either :workspaceId or :id).
 *
 * Usage:
 *   @UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
 *   @RequireRole(WorkspaceRole.ADMIN)
 *   async someAdminAction() { ... }
 *
 * Or without @RequireRole to just check membership:
 *   @UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
 *   async someMemberAction() { ... }
 */
@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly workspacesService: WorkspacesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // Get workspaceId from route params
    const workspaceId =
      request.params.workspaceId || request.params.id || request.body?.workspaceId;

    if (!workspaceId) {
      return false;
    }

    // Get required role from decorator (if any)
    const requiredRole = this.reflector.getAllAndOverride<WorkspaceRole>(
      REQUIRED_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    try {
      if (requiredRole) {
        // Check if user has the required role
        const membership = await this.workspacesService.requireRole(
          workspaceId,
          user.id,
          requiredRole,
        );
        request.workspaceMembership = membership;
      } else {
        // Just check membership
        const membership = await this.workspacesService.requireMembership(
          workspaceId,
          user.id,
        );
        request.workspaceMembership = membership;
      }
      return true;
    } catch {
      return false;
    }
  }
}

