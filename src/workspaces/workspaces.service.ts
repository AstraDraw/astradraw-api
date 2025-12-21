import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceRole, WorkspaceType } from '@prisma/client';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

export interface CreateWorkspaceDto {
  name: string;
  slug?: string;
  avatarUrl?: string;
}

export interface UpdateWorkspaceDto {
  name?: string;
  slug?: string;
  avatarUrl?: string;
}

export interface InviteMemberDto {
  email: string;
  role?: WorkspaceRole;
}

export interface CreateInviteLinkDto {
  role?: WorkspaceRole;
  expiresAt?: Date;
  maxUses?: number;
}

export interface WorkspaceWithRole {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  role: WorkspaceRole;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemberWithUser {
  id: string;
  role: WorkspaceRole;
  userId: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
  };
  createdAt: Date;
}

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a unique slug from a name
   */
  private async generateSlug(name: string): Promise<string> {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30);

    let slug = baseSlug || 'workspace';
    let counter = 0;

    while (await this.prisma.workspace.findUnique({ where: { slug } })) {
      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    return slug;
  }

  /**
   * List all workspaces the user is a member of
   */
  async listWorkspacesForUser(userId: string): Promise<WorkspaceWithRole[]> {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            _count: {
              select: { members: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      avatarUrl: m.workspace.avatarUrl,
      role: m.role,
      memberCount: m.workspace._count.members,
      createdAt: m.workspace.createdAt,
      updatedAt: m.workspace.updatedAt,
    }));
  }

  /**
   * Get a single workspace with user's role
   */
  async getWorkspace(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceWithRole> {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId },
      },
      include: {
        workspace: {
          include: {
            _count: {
              select: { members: true },
            },
          },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    return {
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      avatarUrl: membership.workspace.avatarUrl,
      role: membership.role,
      memberCount: membership.workspace._count.members,
      createdAt: membership.workspace.createdAt,
      updatedAt: membership.workspace.updatedAt,
    };
  }

  /**
   * Create a new workspace (user becomes admin)
   */
  async createWorkspace(
    userId: string,
    dto: CreateWorkspaceDto,
  ): Promise<WorkspaceWithRole> {
    return this.createSharedWorkspace(userId, dto);
  }

  /**
   * Create a shared workspace (user becomes admin)
   */
  async createSharedWorkspace(
    userId: string,
    dto: CreateWorkspaceDto,
  ): Promise<WorkspaceWithRole> {
    const slug = dto.slug || (await this.generateSlug(dto.name));

    // Check if slug is taken
    const existing = await this.prisma.workspace.findUnique({
      where: { slug },
    });
    if (existing) {
      throw new ConflictException('This workspace URL is already taken');
    }

    const workspace = await this.prisma.workspace.create({
      data: {
        name: dto.name,
        slug,
        avatarUrl: dto.avatarUrl,
        type: WorkspaceType.SHARED,
        members: {
          create: {
            userId,
            role: WorkspaceRole.ADMIN,
          },
        },
      },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    this.logger.log(`Created workspace ${workspace.name} for user ${userId}`);

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      avatarUrl: workspace.avatarUrl,
      role: WorkspaceRole.ADMIN,
      memberCount: workspace._count.members,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }

  /**
   * Update workspace settings (admin only)
   */
  async updateWorkspace(
    workspaceId: string,
    userId: string,
    dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceWithRole> {
    await this.requireRole(workspaceId, userId, WorkspaceRole.ADMIN);

    // Check slug uniqueness if changing
    if (dto.slug) {
      const existing = await this.prisma.workspace.findFirst({
        where: { slug: dto.slug, id: { not: workspaceId } },
      });
      if (existing) {
        throw new ConflictException('This workspace URL is already taken');
      }
    }

    const workspace = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: dto.name,
        slug: dto.slug,
        avatarUrl: dto.avatarUrl,
      },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      avatarUrl: workspace.avatarUrl,
      role: WorkspaceRole.ADMIN,
      memberCount: workspace._count.members,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }

  /**
   * Delete a workspace (admin only)
   */
  async deleteWorkspace(workspaceId: string, userId: string): Promise<void> {
    await this.requireRole(workspaceId, userId, WorkspaceRole.ADMIN);

    await this.prisma.workspace.delete({
      where: { id: workspaceId },
    });

    this.logger.log(`Deleted workspace ${workspaceId}`);
  }

  // ===========================================================================
  // Member Management
  // ===========================================================================

  /**
   * List all members of a workspace
   */
  async listMembers(
    workspaceId: string,
    userId: string,
  ): Promise<MemberWithUser[]> {
    // Any member can view the member list
    await this.requireMembership(workspaceId, userId);

    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    return members.map((m) => ({
      id: m.id,
      role: m.role,
      userId: m.userId,
      user: m.user,
      createdAt: m.createdAt,
    }));
  }

  /**
   * Invite a user to the workspace by email (admin only)
   */
  async inviteMember(
    workspaceId: string,
    adminUserId: string,
    dto: InviteMemberDto,
  ): Promise<MemberWithUser> {
    await this.requireSharedWorkspace(workspaceId);
    await this.requireRole(workspaceId, adminUserId, WorkspaceRole.ADMIN);

    // Find the user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new NotFoundException(
        'User not found. They must create an account first.',
      );
    }

    // Check if already a member
    const existingMember = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId: user.id },
      },
    });

    if (existingMember) {
      throw new ConflictException('User is already a member of this workspace');
    }

    const member = await this.prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: user.id,
        role: dto.role || WorkspaceRole.MEMBER,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    this.logger.log(
      `Added ${user.email} to workspace ${workspaceId} as ${member.role}`,
    );

    return {
      id: member.id,
      role: member.role,
      userId: member.userId,
      user: member.user,
      createdAt: member.createdAt,
    };
  }

  /**
   * Update a member's role (admin only)
   */
  async updateMemberRole(
    workspaceId: string,
    adminUserId: string,
    memberId: string,
    newRole: WorkspaceRole,
  ): Promise<MemberWithUser> {
    await this.requireRole(workspaceId, adminUserId, WorkspaceRole.ADMIN);

    const member = await this.prisma.workspaceMember.findUnique({
      where: { id: memberId },
      include: { user: true },
    });

    if (!member || member.workspaceId !== workspaceId) {
      throw new NotFoundException('Member not found');
    }

    // Prevent demoting the last admin
    if (
      member.role === WorkspaceRole.ADMIN &&
      newRole !== WorkspaceRole.ADMIN
    ) {
      const adminCount = await this.prisma.workspaceMember.count({
        where: { workspaceId, role: WorkspaceRole.ADMIN },
      });
      if (adminCount <= 1) {
        throw new BadRequestException(
          'Cannot demote the last admin. Promote another member first.',
        );
      }
    }

    const updated = await this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role: newRole },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    this.logger.log(
      `Updated ${member.user.email} role to ${newRole} in workspace ${workspaceId}`,
    );

    return {
      id: updated.id,
      role: updated.role,
      userId: updated.userId,
      user: updated.user,
      createdAt: updated.createdAt,
    };
  }

  /**
   * Remove a member from the workspace (admin only, or self-leave)
   */
  async removeMember(
    workspaceId: string,
    actingUserId: string,
    memberId: string,
  ): Promise<void> {
    const actingMember = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId: actingUserId },
      },
    });

    if (!actingMember) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    const targetMember = await this.prisma.workspaceMember.findUnique({
      where: { id: memberId },
    });

    if (!targetMember || targetMember.workspaceId !== workspaceId) {
      throw new NotFoundException('Member not found');
    }

    // Allow self-leave or admin removal
    const isSelfLeave = targetMember.userId === actingUserId;
    const isAdmin = actingMember.role === WorkspaceRole.ADMIN;

    if (!isSelfLeave && !isAdmin) {
      throw new ForbiddenException('Only admins can remove other members');
    }

    // Prevent removing the last admin
    if (targetMember.role === WorkspaceRole.ADMIN) {
      const adminCount = await this.prisma.workspaceMember.count({
        where: { workspaceId, role: WorkspaceRole.ADMIN },
      });
      if (adminCount <= 1) {
        throw new BadRequestException(
          'Cannot remove the last admin. Transfer ownership first.',
        );
      }
    }

    await this.prisma.workspaceMember.delete({
      where: { id: memberId },
    });

    this.logger.log(`Removed member ${memberId} from workspace ${workspaceId}`);
  }

  // ===========================================================================
  // Invite Links
  // ===========================================================================

  /**
   * Create an invite link (admin only)
   */
  async createInviteLink(
    workspaceId: string,
    userId: string,
    dto: CreateInviteLinkDto,
  ) {
    await this.requireSharedWorkspace(workspaceId);
    await this.requireRole(workspaceId, userId, WorkspaceRole.ADMIN);

    const inviteLink = await this.prisma.inviteLink.create({
      data: {
        code: nanoid(),
        workspaceId,
        role: dto.role || WorkspaceRole.MEMBER,
        expiresAt: dto.expiresAt,
        maxUses: dto.maxUses,
      },
    });

    return inviteLink;
  }

  /**
   * List invite links for a workspace (admin only)
   */
  async listInviteLinks(workspaceId: string, userId: string) {
    await this.requireRole(workspaceId, userId, WorkspaceRole.ADMIN);

    return this.prisma.inviteLink.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Delete an invite link (admin only)
   */
  async deleteInviteLink(
    workspaceId: string,
    userId: string,
    linkId: string,
  ): Promise<void> {
    await this.requireRole(workspaceId, userId, WorkspaceRole.ADMIN);

    const link = await this.prisma.inviteLink.findUnique({
      where: { id: linkId },
    });

    if (!link || link.workspaceId !== workspaceId) {
      throw new NotFoundException('Invite link not found');
    }

    await this.prisma.inviteLink.delete({
      where: { id: linkId },
    });
  }

  /**
   * Join a workspace via invite link
   */
  async joinViaInviteLink(
    code: string,
    userId: string,
  ): Promise<WorkspaceWithRole> {
    const link = await this.prisma.inviteLink.findUnique({
      where: { code },
      include: { workspace: true },
    });

    if (!link) {
      throw new NotFoundException('Invalid invite link');
    }

    // Check expiration
    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new BadRequestException('This invite link has expired');
    }

    // Check max uses
    if (link.maxUses && link.uses >= link.maxUses) {
      throw new BadRequestException(
        'This invite link has reached its maximum uses',
      );
    }

    // Prevent joining personal workspaces via links
    if (link.workspace.type === WorkspaceType.PERSONAL) {
      throw new ForbiddenException(
        'Cannot join a personal workspace via invite link',
      );
    }

    // Check if already a member
    const existingMember = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: link.workspaceId, userId },
      },
    });

    if (existingMember) {
      // Already a member, just return the workspace
      return this.getWorkspace(link.workspaceId, userId);
    }

    // Create membership and increment link uses
    await this.prisma.$transaction([
      this.prisma.workspaceMember.create({
        data: {
          workspaceId: link.workspaceId,
          userId,
          role: link.role,
        },
      }),
      this.prisma.inviteLink.update({
        where: { id: link.id },
        data: { uses: { increment: 1 } },
      }),
    ]);

    this.logger.log(
      `User ${userId} joined workspace ${link.workspaceId} via invite link`,
    );

    return this.getWorkspace(link.workspaceId, userId);
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Get user's membership in a workspace
   */
  async getMembership(workspaceId: string, userId: string) {
    return this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId },
      },
    });
  }

  /**
   * Check if user is a member of the workspace
   */
  async requireMembership(workspaceId: string, userId: string) {
    const membership = await this.getMembership(workspaceId, userId);
    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }
    return membership;
  }

  /**
   * Check if user has the required role
   */
  async requireRole(
    workspaceId: string,
    userId: string,
    requiredRole: WorkspaceRole,
  ) {
    const membership = await this.requireMembership(workspaceId, userId);

    const roleHierarchy = {
      [WorkspaceRole.ADMIN]: 3,
      [WorkspaceRole.MEMBER]: 2,
      [WorkspaceRole.VIEWER]: 1,
    };

    if (roleHierarchy[membership.role] < roleHierarchy[requiredRole]) {
      throw new ForbiddenException(
        `This action requires ${requiredRole} role or higher`,
      );
    }

    return membership;
  }

  /**
   * Check if user is admin of the workspace
   */
  async isAdmin(workspaceId: string, userId: string): Promise<boolean> {
    const membership = await this.getMembership(workspaceId, userId);
    return membership?.role === WorkspaceRole.ADMIN;
  }

  /**
   * Ensure the workspace exists and is not personal (used for invites/teams)
   */
  async requireSharedWorkspace(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, type: true },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    if (workspace.type === WorkspaceType.PERSONAL) {
      throw new ForbiddenException(
        'This action is not available for personal workspaces',
      );
    }

    return workspace;
  }
}
