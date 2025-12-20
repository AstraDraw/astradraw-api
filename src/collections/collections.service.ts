import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceRole } from '@prisma/client';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { TeamsService } from '../teams/teams.service';

export interface CreateCollectionDto {
  name: string;
  icon?: string;
  color?: string;
  isPrivate?: boolean;
}

export interface UpdateCollectionDto {
  name?: string;
  icon?: string;
  color?: string;
  isPrivate?: boolean;
}

export interface CollectionWithAccess {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  isPrivate: boolean;
  userId: string;
  workspaceId: string;
  sceneCount: number;
  canWrite: boolean;
  isOwner: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService,
    private readonly teamsService: TeamsService,
  ) {}

  /**
   * List all collections accessible to the user in a workspace
   */
  async listCollections(
    workspaceId: string,
    userId: string,
  ): Promise<CollectionWithAccess[]> {
    const membership = await this.workspacesService.requireMembership(
      workspaceId,
      userId,
    );

    const isAdmin = membership.role === WorkspaceRole.ADMIN;

    // Get collections the user has access to via teams
    const teamAccess = await this.teamsService.getAccessibleCollectionIds(
      workspaceId,
      userId,
    );
    const teamCollectionIds = new Set(teamAccess.map((t) => t.collectionId));
    const teamWriteAccess = new Map(
      teamAccess.map((t) => [t.collectionId, t.canWrite]),
    );

    // Get all collections in the workspace
    const collections = await this.prisma.collection.findMany({
      where: { workspaceId },
      include: {
        _count: {
          select: { scenes: true },
        },
      },
      orderBy: [{ isPrivate: 'asc' }, { name: 'asc' }],
    });

    // Filter and map collections based on access rules
    const accessibleCollections: CollectionWithAccess[] = [];

    for (const collection of collections) {
      const isOwner = collection.userId === userId;

      // Access rules:
      // 1. Admin can see everything
      // 2. Owner can see their own collections
      // 3. Non-private collections are visible if user has team access
      const canSee =
        isAdmin ||
        isOwner ||
        (!collection.isPrivate && teamCollectionIds.has(collection.id));

      if (!canSee) {
        continue;
      }

      // Write access rules:
      // 1. Admin can write to everything
      // 2. Owner can write to their own collections
      // 3. Team access with canWrite=true
      const canWrite =
        isAdmin ||
        isOwner ||
        (teamWriteAccess.get(collection.id) ?? false);

      accessibleCollections.push({
        id: collection.id,
        name: collection.name,
        icon: collection.icon,
        color: collection.color,
        isPrivate: collection.isPrivate,
        userId: collection.userId,
        workspaceId: collection.workspaceId,
        sceneCount: collection._count.scenes,
        canWrite,
        isOwner,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
      });
    }

    return accessibleCollections;
  }

  /**
   * Get a single collection with access info
   */
  async getCollection(
    collectionId: string,
    userId: string,
  ): Promise<CollectionWithAccess> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: {
        _count: {
          select: { scenes: true },
        },
      },
    });

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    const membership = await this.workspacesService.getMembership(
      collection.workspaceId,
      userId,
    );

    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    const isAdmin = membership.role === WorkspaceRole.ADMIN;
    const isOwner = collection.userId === userId;

    // Check access
    if (!isAdmin && !isOwner) {
      if (collection.isPrivate) {
        throw new ForbiddenException('This is a private collection');
      }

      // Check team access
      const teamAccess = await this.teamsService.getAccessibleCollectionIds(
        collection.workspaceId,
        userId,
      );
      const hasTeamAccess = teamAccess.some(
        (t) => t.collectionId === collectionId,
      );

      if (!hasTeamAccess) {
        throw new ForbiddenException(
          'You do not have access to this collection',
        );
      }
    }

    // Determine write access
    const teamAccess = await this.teamsService.getAccessibleCollectionIds(
      collection.workspaceId,
      userId,
    );
    const teamWriteAccess = teamAccess.find(
      (t) => t.collectionId === collectionId,
    )?.canWrite;
    const canWrite = isAdmin || isOwner || (teamWriteAccess ?? false);

    return {
      id: collection.id,
      name: collection.name,
      icon: collection.icon,
      color: collection.color,
      isPrivate: collection.isPrivate,
      userId: collection.userId,
      workspaceId: collection.workspaceId,
      sceneCount: collection._count.scenes,
      canWrite,
      isOwner,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    };
  }

  /**
   * Create a new collection
   */
  async createCollection(
    workspaceId: string,
    userId: string,
    dto: CreateCollectionDto,
  ): Promise<CollectionWithAccess> {
    const membership = await this.workspacesService.requireMembership(
      workspaceId,
      userId,
    );

    // Viewers cannot create collections
    if (membership.role === WorkspaceRole.VIEWER) {
      throw new ForbiddenException('Viewers cannot create collections');
    }

    const collection = await this.prisma.collection.create({
      data: {
        name: dto.name,
        icon: dto.icon,
        color: dto.color,
        isPrivate: dto.isPrivate ?? false,
        userId,
        workspaceId,
      },
      include: {
        _count: {
          select: { scenes: true },
        },
      },
    });

    this.logger.log(
      `Created collection ${collection.name} in workspace ${workspaceId}`,
    );

    return {
      id: collection.id,
      name: collection.name,
      icon: collection.icon,
      color: collection.color,
      isPrivate: collection.isPrivate,
      userId: collection.userId,
      workspaceId: collection.workspaceId,
      sceneCount: collection._count.scenes,
      canWrite: true,
      isOwner: true,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    };
  }

  /**
   * Update a collection
   */
  async updateCollection(
    collectionId: string,
    userId: string,
    dto: UpdateCollectionDto,
  ): Promise<CollectionWithAccess> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    const membership = await this.workspacesService.getMembership(
      collection.workspaceId,
      userId,
    );

    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    const isAdmin = membership.role === WorkspaceRole.ADMIN;
    const isOwner = collection.userId === userId;

    // Only admin or owner can update
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('Only the owner or admin can update this collection');
    }

    const updated = await this.prisma.collection.update({
      where: { id: collectionId },
      data: {
        name: dto.name,
        icon: dto.icon,
        color: dto.color,
        isPrivate: dto.isPrivate,
      },
      include: {
        _count: {
          select: { scenes: true },
        },
      },
    });

    this.logger.log(`Updated collection ${collectionId}`);

    return {
      id: updated.id,
      name: updated.name,
      icon: updated.icon,
      color: updated.color,
      isPrivate: updated.isPrivate,
      userId: updated.userId,
      workspaceId: updated.workspaceId,
      sceneCount: updated._count.scenes,
      canWrite: true,
      isOwner,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Delete a collection
   */
  async deleteCollection(collectionId: string, userId: string): Promise<void> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    const membership = await this.workspacesService.getMembership(
      collection.workspaceId,
      userId,
    );

    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    const isAdmin = membership.role === WorkspaceRole.ADMIN;
    const isOwner = collection.userId === userId;

    // Only admin or owner can delete
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('Only the owner or admin can delete this collection');
    }

    await this.prisma.collection.delete({
      where: { id: collectionId },
    });

    this.logger.log(`Deleted collection ${collectionId}`);
  }

  /**
   * Check if user can access a collection
   */
  async canAccessCollection(
    collectionId: string,
    userId: string,
  ): Promise<{ canRead: boolean; canWrite: boolean }> {
    try {
      const collection = await this.getCollection(collectionId, userId);
      return { canRead: true, canWrite: collection.canWrite };
    } catch {
      return { canRead: false, canWrite: false };
    }
  }

  /**
   * Check if user can write to a collection (for scene operations)
   */
  async requireWriteAccess(collectionId: string, userId: string): Promise<void> {
    const access = await this.canAccessCollection(collectionId, userId);
    if (!access.canRead) {
      throw new ForbiddenException('You do not have access to this collection');
    }
    if (!access.canWrite) {
      throw new ForbiddenException('You do not have write access to this collection');
    }
  }
}

