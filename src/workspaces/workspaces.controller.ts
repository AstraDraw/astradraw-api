import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { User, WorkspaceRole } from '@prisma/client';
import { WorkspacesService } from './workspaces.service';
import { WorkspaceRoleGuard, RequireRole } from './workspace-role.guard';

// DTOs
interface CreateWorkspaceDto {
  name: string;
  slug?: string;
  avatarUrl?: string;
}

interface UpdateWorkspaceDto {
  name?: string;
  slug?: string;
  avatarUrl?: string;
}

interface InviteMemberDto {
  email: string;
  role?: WorkspaceRole;
}

interface UpdateMemberRoleDto {
  role: WorkspaceRole;
}

interface CreateInviteLinkDto {
  role?: WorkspaceRole;
  expiresAt?: string;
  maxUses?: number;
}

interface JoinViaLinkDto {
  code: string;
}

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  private readonly logger = new Logger(WorkspacesController.name);

  constructor(private readonly workspacesService: WorkspacesService) {}

  // ===========================================================================
  // Workspace CRUD
  // ===========================================================================

  /**
   * List all workspaces the current user is a member of
   */
  @Get()
  async listWorkspaces(@CurrentUser() user: User) {
    return this.workspacesService.listWorkspacesForUser(user.id);
  }

  /**
   * Get a single workspace
   */
  @Get(':workspaceId')
  @UseGuards(WorkspaceRoleGuard)
  async getWorkspace(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: User,
  ) {
    return this.workspacesService.getWorkspace(workspaceId, user.id);
  }

  /**
   * Create a new workspace
   */
  @Post()
  async createWorkspace(
    @Body() dto: CreateWorkspaceDto,
    @CurrentUser() user: User,
  ) {
    return this.workspacesService.createWorkspace(user.id, dto);
  }

  /**
   * Update workspace settings (admin only)
   */
  @Put(':workspaceId')
  @UseGuards(WorkspaceRoleGuard)
  @RequireRole(WorkspaceRole.ADMIN)
  async updateWorkspace(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
    @CurrentUser() user: User,
  ) {
    return this.workspacesService.updateWorkspace(workspaceId, user.id, dto);
  }

  /**
   * Delete a workspace (admin only)
   */
  @Delete(':workspaceId')
  @UseGuards(WorkspaceRoleGuard)
  @RequireRole(WorkspaceRole.ADMIN)
  async deleteWorkspace(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: User,
  ) {
    await this.workspacesService.deleteWorkspace(workspaceId, user.id);
    return { success: true };
  }

  // ===========================================================================
  // Member Management
  // ===========================================================================

  /**
   * List all members of a workspace
   */
  @Get(':workspaceId/members')
  @UseGuards(WorkspaceRoleGuard)
  async listMembers(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: User,
  ) {
    return this.workspacesService.listMembers(workspaceId, user.id);
  }

  /**
   * Invite a user to the workspace (admin only)
   */
  @Post(':workspaceId/members/invite')
  @UseGuards(WorkspaceRoleGuard)
  @RequireRole(WorkspaceRole.ADMIN)
  async inviteMember(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: InviteMemberDto,
    @CurrentUser() user: User,
  ) {
    return this.workspacesService.inviteMember(workspaceId, user.id, dto);
  }

  /**
   * Update a member's role (admin only)
   */
  @Put(':workspaceId/members/:memberId')
  @UseGuards(WorkspaceRoleGuard)
  @RequireRole(WorkspaceRole.ADMIN)
  async updateMemberRole(
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: User,
  ) {
    return this.workspacesService.updateMemberRole(
      workspaceId,
      user.id,
      memberId,
      dto.role,
    );
  }

  /**
   * Remove a member from the workspace (admin only, or self-leave)
   */
  @Delete(':workspaceId/members/:memberId')
  @UseGuards(WorkspaceRoleGuard)
  async removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: User,
  ) {
    await this.workspacesService.removeMember(workspaceId, user.id, memberId);
    return { success: true };
  }

  // ===========================================================================
  // Invite Links
  // ===========================================================================

  /**
   * List invite links (admin only)
   */
  @Get(':workspaceId/invite-links')
  @UseGuards(WorkspaceRoleGuard)
  @RequireRole(WorkspaceRole.ADMIN)
  async listInviteLinks(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: User,
  ) {
    return this.workspacesService.listInviteLinks(workspaceId, user.id);
  }

  /**
   * Create an invite link (admin only)
   */
  @Post(':workspaceId/invite-links')
  @UseGuards(WorkspaceRoleGuard)
  @RequireRole(WorkspaceRole.ADMIN)
  async createInviteLink(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateInviteLinkDto,
    @CurrentUser() user: User,
  ) {
    return this.workspacesService.createInviteLink(workspaceId, user.id, {
      role: dto.role,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      maxUses: dto.maxUses,
    });
  }

  /**
   * Delete an invite link (admin only)
   */
  @Delete(':workspaceId/invite-links/:linkId')
  @UseGuards(WorkspaceRoleGuard)
  @RequireRole(WorkspaceRole.ADMIN)
  async deleteInviteLink(
    @Param('workspaceId') workspaceId: string,
    @Param('linkId') linkId: string,
    @CurrentUser() user: User,
  ) {
    await this.workspacesService.deleteInviteLink(workspaceId, user.id, linkId);
    return { success: true };
  }

  /**
   * Join a workspace via invite link
   */
  @Post('join')
  async joinViaInviteLink(
    @Body() dto: JoinViaLinkDto,
    @CurrentUser() user: User,
  ) {
    return this.workspacesService.joinViaInviteLink(dto.code, user.id);
  }
}
