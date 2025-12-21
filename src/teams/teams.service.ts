import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionAccessLevel, WorkspaceRole } from '@prisma/client';
import { WorkspacesService } from '../workspaces/workspaces.service';

export interface CreateTeamDto {
  name: string;
  color: string;
  memberIds?: string[]; // WorkspaceMember IDs
  collectionIds?: string[]; // Collection IDs with write access
}

export interface UpdateTeamDto {
  name?: string;
  color?: string;
  memberIds?: string[];
  collectionIds?: string[];
}

export interface TeamWithDetails {
  id: string;
  name: string;
  color: string;
  workspaceId: string;
  memberCount: number;
  collectionCount: number;
  members: {
    id: string;
    userId: string;
    user: {
      id: string;
      email: string;
      name: string | null;
      avatarUrl: string | null;
    };
  }[];
  collections: {
    id: string;
    name: string;
    icon: string | null;
    accessLevel: CollectionAccessLevel;
    canWrite: boolean;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  /**
   * List all teams in a workspace
   */
  async listTeams(
    workspaceId: string,
    userId: string,
  ): Promise<TeamWithDetails[]> {
    // Any member can view teams
    await this.workspacesService.requireMembership(workspaceId, userId);

    const teams = await this.prisma.team.findMany({
      where: { workspaceId },
      include: {
        members: {
          include: {
            member: {
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
            },
          },
        },
        collections: {
          include: {
            collection: {
              select: {
                id: true,
                name: true,
                icon: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: true,
            collections: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return teams.map((team) => ({
      id: team.id,
      name: team.name,
      color: team.color,
      workspaceId: team.workspaceId,
      memberCount: team._count.members,
      collectionCount: team._count.collections,
      members: team.members.map((tm) => ({
        id: tm.member.id,
        userId: tm.member.userId,
        user: tm.member.user,
      })),
      collections: team.collections.map((tc) => ({
        id: tc.collection.id,
        name: tc.collection.name,
        icon: tc.collection.icon,
        accessLevel: tc.accessLevel,
        canWrite: tc.accessLevel === CollectionAccessLevel.EDIT,
      })),
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    }));
  }

  /**
   * Get a single team
   */
  async getTeam(teamId: string, userId: string): Promise<TeamWithDetails> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          include: {
            member: {
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
            },
          },
        },
        collections: {
          include: {
            collection: {
              select: {
                id: true,
                name: true,
                icon: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: true,
            collections: true,
          },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Check membership
    await this.workspacesService.requireMembership(team.workspaceId, userId);

    return {
      id: team.id,
      name: team.name,
      color: team.color,
      workspaceId: team.workspaceId,
      memberCount: team._count.members,
      collectionCount: team._count.collections,
      members: team.members.map((tm) => ({
        id: tm.member.id,
        userId: tm.member.userId,
        user: tm.member.user,
      })),
      collections: team.collections.map((tc) => ({
        id: tc.collection.id,
        name: tc.collection.name,
        icon: tc.collection.icon,
        accessLevel: tc.accessLevel,
        canWrite: tc.accessLevel === CollectionAccessLevel.EDIT,
      })),
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    };
  }

  /**
   * Create a new team (admin only)
   */
  async createTeam(
    workspaceId: string,
    userId: string,
    dto: CreateTeamDto,
  ): Promise<TeamWithDetails> {
    await this.workspacesService.requireSharedWorkspace(workspaceId);
    await this.workspacesService.requireRole(
      workspaceId,
      userId,
      WorkspaceRole.ADMIN,
    );

    // Validate member IDs belong to this workspace
    if (dto.memberIds?.length) {
      const validMembers = await this.prisma.workspaceMember.count({
        where: {
          id: { in: dto.memberIds },
          workspaceId,
        },
      });
      if (validMembers !== dto.memberIds.length) {
        throw new BadRequestException('Some member IDs are invalid');
      }
    }

    // Validate collection IDs belong to this workspace
    if (dto.collectionIds?.length) {
      const validCollections = await this.prisma.collection.count({
        where: {
          id: { in: dto.collectionIds },
          workspaceId,
        },
      });
      if (validCollections !== dto.collectionIds.length) {
        throw new BadRequestException('Some collection IDs are invalid');
      }
    }

    const team = await this.prisma.team.create({
      data: {
        name: dto.name,
        color: dto.color,
        workspaceId,
        members: dto.memberIds?.length
          ? {
              create: dto.memberIds.map((memberId) => ({ memberId })),
            }
          : undefined,
        collections: dto.collectionIds?.length
          ? {
              create: dto.collectionIds.map((collectionId) => ({
                collectionId,
                accessLevel: CollectionAccessLevel.EDIT,
              })),
            }
          : undefined,
      },
      include: {
        members: {
          include: {
            member: {
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
            },
          },
        },
        collections: {
          include: {
            collection: {
              select: {
                id: true,
                name: true,
                icon: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: true,
            collections: true,
          },
        },
      },
    });

    this.logger.log(`Created team ${team.name} in workspace ${workspaceId}`);

    return {
      id: team.id,
      name: team.name,
      color: team.color,
      workspaceId: team.workspaceId,
      memberCount: team._count.members,
      collectionCount: team._count.collections,
      members: team.members.map((tm) => ({
        id: tm.member.id,
        userId: tm.member.userId,
        user: tm.member.user,
      })),
      collections: team.collections.map((tc) => ({
        id: tc.collection.id,
        name: tc.collection.name,
        icon: tc.collection.icon,
        accessLevel: tc.accessLevel,
        canWrite: tc.accessLevel === CollectionAccessLevel.EDIT,
      })),
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    };
  }

  /**
   * Update a team (admin only)
   */
  async updateTeam(
    teamId: string,
    userId: string,
    dto: UpdateTeamDto,
  ): Promise<TeamWithDetails> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    await this.workspacesService.requireSharedWorkspace(team.workspaceId);
    await this.workspacesService.requireRole(
      team.workspaceId,
      userId,
      WorkspaceRole.ADMIN,
    );

    // Validate member IDs if provided
    if (dto.memberIds !== undefined) {
      if (dto.memberIds.length > 0) {
        const validMembers = await this.prisma.workspaceMember.count({
          where: {
            id: { in: dto.memberIds },
            workspaceId: team.workspaceId,
          },
        });
        if (validMembers !== dto.memberIds.length) {
          throw new BadRequestException('Some member IDs are invalid');
        }
      }

      // Delete existing members and re-create
      await this.prisma.teamMember.deleteMany({
        where: { teamId },
      });

      if (dto.memberIds.length > 0) {
        await this.prisma.teamMember.createMany({
          data: dto.memberIds.map((memberId) => ({ teamId, memberId })),
        });
      }
    }

    // Validate collection IDs if provided
    if (dto.collectionIds !== undefined) {
      if (dto.collectionIds.length > 0) {
        const validCollections = await this.prisma.collection.count({
          where: {
            id: { in: dto.collectionIds },
            workspaceId: team.workspaceId,
          },
        });
        if (validCollections !== dto.collectionIds.length) {
          throw new BadRequestException('Some collection IDs are invalid');
        }
      }

      // Delete existing collections and re-create
      await this.prisma.teamCollection.deleteMany({
        where: { teamId },
      });

      if (dto.collectionIds.length > 0) {
        await this.prisma.teamCollection.createMany({
          data: dto.collectionIds.map((collectionId) => ({
            teamId,
            collectionId,
            accessLevel: CollectionAccessLevel.EDIT,
          })),
        });
      }
    }

    // Update team basic info
    const updated = await this.prisma.team.update({
      where: { id: teamId },
      data: {
        name: dto.name,
        color: dto.color,
      },
      include: {
        members: {
          include: {
            member: {
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
            },
          },
        },
        collections: {
          include: {
            collection: {
              select: {
                id: true,
                name: true,
                icon: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: true,
            collections: true,
          },
        },
      },
    });

    this.logger.log(`Updated team ${teamId}`);

    return {
      id: updated.id,
      name: updated.name,
      color: updated.color,
      workspaceId: updated.workspaceId,
      memberCount: updated._count.members,
      collectionCount: updated._count.collections,
      members: updated.members.map((tm) => ({
        id: tm.member.id,
        userId: tm.member.userId,
        user: tm.member.user,
      })),
      collections: updated.collections.map((tc) => ({
        id: tc.collection.id,
        name: tc.collection.name,
        icon: tc.collection.icon,
        accessLevel: tc.accessLevel,
        canWrite: tc.accessLevel === CollectionAccessLevel.EDIT,
      })),
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Delete a team (admin only)
   */
  async deleteTeam(teamId: string, userId: string): Promise<void> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    await this.workspacesService.requireSharedWorkspace(team.workspaceId);
    await this.workspacesService.requireRole(
      team.workspaceId,
      userId,
      WorkspaceRole.ADMIN,
    );

    await this.prisma.team.delete({
      where: { id: teamId },
    });

    this.logger.log(`Deleted team ${teamId}`);
  }

  /**
   * Get all teams a workspace member belongs to
   */
  async getTeamsForMember(memberId: string): Promise<string[]> {
    const teamMembers = await this.prisma.teamMember.findMany({
      where: { memberId },
      select: { teamId: true },
    });
    return teamMembers.map((tm) => tm.teamId);
  }

  /**
   * Get all collection IDs a user has access to via teams
   */
  async getAccessibleCollectionIds(
    workspaceId: string,
    userId: string,
  ): Promise<
    {
      collectionId: string;
      accessLevel: CollectionAccessLevel;
      canWrite: boolean;
    }[]
  > {
    // Get user's membership
    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId },
      },
    });

    if (!membership) {
      return [];
    }

    // Get all teams the user is in
    const teamIds = await this.getTeamsForMember(membership.id);

    if (teamIds.length === 0) {
      return [];
    }

    // Get all collections these teams have access to
    const teamCollections = await this.prisma.teamCollection.findMany({
      where: { teamId: { in: teamIds } },
      select: { collectionId: true, accessLevel: true },
    });

    // Deduplicate and merge permissions (if user has access via multiple teams)
    const collectionMap = new Map<string, CollectionAccessLevel>();
    for (const tc of teamCollections) {
      const existing = collectionMap.get(tc.collectionId);
      if (existing === CollectionAccessLevel.EDIT) {
        continue;
      }
      collectionMap.set(tc.collectionId, tc.accessLevel);
    }

    return Array.from(collectionMap.entries()).map(
      ([collectionId, accessLevel]) => ({
        collectionId,
        accessLevel,
        canWrite: accessLevel === CollectionAccessLevel.EDIT,
      }),
    );
  }
}
