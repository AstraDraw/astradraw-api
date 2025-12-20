import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
  NotFoundException,
  ForbiddenException,
  Inject,
  Header,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Readable } from 'stream';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { User, WorkspaceRole } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import {
  IStorageService,
  STORAGE_SERVICE,
  StorageNamespace,
} from '../storage/storage.interface';
import { CollectionsService } from '../collections/collections.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { TeamsService } from '../teams/teams.service';

// DTOs
interface CreateSceneDto {
  title?: string;
  thumbnail?: string;
  data?: Buffer | string;
  collectionId?: string;
  workspaceId?: string;
}

interface UpdateSceneDto {
  title?: string;
  thumbnail?: string;
  data?: Buffer | string;
  collectionId?: string;
}

interface SceneResponse {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  storageKey: string;
  roomId: string | null;
  collectionId: string | null;
  isPublic: boolean;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
}

@Controller('workspace/scenes')
@UseGuards(JwtAuthGuard)
export class WorkspaceScenesController {
  private readonly logger = new Logger(WorkspaceScenesController.name);
  private readonly namespace = StorageNamespace.SCENES;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
    private readonly collectionsService: CollectionsService,
    private readonly workspacesService: WorkspacesService,
    private readonly teamsService: TeamsService,
  ) {}

  /**
   * Check if user can access a scene (read)
   */
  private async canAccessScene(
    scene: { userId: string; collectionId: string | null; isPublic: boolean },
    userId: string,
  ): Promise<boolean> {
    // Owner always has access
    if (scene.userId === userId) {
      return true;
    }

    // Public scenes are accessible
    if (scene.isPublic) {
      return true;
    }

    // Check collection-based access
    if (scene.collectionId) {
      const access = await this.collectionsService.canAccessCollection(
        scene.collectionId,
        userId,
      );
      return access.canRead;
    }

    return false;
  }

  /**
   * Check if user can edit a scene (write)
   */
  private async canEditScene(
    scene: { userId: string; collectionId: string | null },
    userId: string,
  ): Promise<boolean> {
    // Owner always can edit
    if (scene.userId === userId) {
      return true;
    }

    // Check collection-based write access
    if (scene.collectionId) {
      const access = await this.collectionsService.canAccessCollection(
        scene.collectionId,
        userId,
      );
      return access.canWrite;
    }

    return false;
  }

  /**
   * List scenes for a workspace (filtered by accessible collections)
   */
  @Get()
  async listScenes(
    @CurrentUser() user: User,
    @Query('workspaceId') workspaceId?: string,
    @Query('collectionId') collectionId?: string,
  ): Promise<SceneResponse[]> {
    // If workspaceId is provided, list scenes from that workspace
    if (workspaceId) {
      return this.listWorkspaceScenes(user, workspaceId, collectionId);
    }

    // Legacy behavior: list user's own scenes
    const scenes = await this.prisma.scene.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
    });

    return scenes.map((scene) => this.toSceneResponse(scene, true));
  }

  /**
   * List scenes from a specific workspace
   */
  private async listWorkspaceScenes(
    user: User,
    workspaceId: string,
    collectionId?: string,
  ): Promise<SceneResponse[]> {
    // Check workspace membership
    const membership = await this.workspacesService.getMembership(
      workspaceId,
      user.id,
    );

    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    const isAdmin = membership.role === WorkspaceRole.ADMIN;

    // Get accessible collections
    const accessibleCollections = await this.collectionsService.listCollections(
      workspaceId,
      user.id,
    );
    const accessibleCollectionIds = accessibleCollections.map((c) => c.id);
    const writeAccessIds = new Set(
      accessibleCollections.filter((c) => c.canWrite).map((c) => c.id),
    );

    // Build query filter
    const whereClause: any = {};

    if (collectionId) {
      // Filter by specific collection
      if (!accessibleCollectionIds.includes(collectionId)) {
        throw new ForbiddenException(
          'You do not have access to this collection',
        );
      }
      whereClause.collectionId = collectionId;
    } else {
      // Filter by all accessible collections in this workspace
      whereClause.collection = {
        workspaceId,
      };

      if (!isAdmin) {
        // Non-admins can only see scenes in collections they have access to
        // or their own scenes
        whereClause.OR = [
          { collectionId: { in: accessibleCollectionIds } },
          { userId: user.id },
        ];
      }
    }

    const scenes = await this.prisma.scene.findMany({
      where: whereClause,
      orderBy: { updatedAt: 'desc' },
      include: {
        collection: {
          select: { id: true, workspaceId: true },
        },
      },
    });

    return scenes.map((scene) => {
      const canEdit =
        scene.userId === user.id ||
        isAdmin ||
        (scene.collectionId && writeAccessIds.has(scene.collectionId));
      return this.toSceneResponse(scene, canEdit);
    });
  }

  /**
   * Get a specific scene by ID
   */
  @Get(':id')
  async getScene(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<SceneResponse> {
    const scene = await this.prisma.scene.findUnique({
      where: { id },
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    // Check access
    const canAccess = await this.canAccessScene(scene, user.id);
    if (!canAccess) {
      throw new ForbiddenException('Access denied');
    }

    // Update last opened timestamp
    await this.prisma.scene.update({
      where: { id },
      data: { lastOpenedAt: new Date() },
    });

    const canEdit = await this.canEditScene(scene, user.id);
    return this.toSceneResponse(scene, canEdit);
  }

  /**
   * Get scene data (the actual Excalidraw content)
   */
  @Get(':id/data')
  @Header('content-type', 'application/octet-stream')
  async getSceneData(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ): Promise<void> {
    const scene = await this.prisma.scene.findUnique({
      where: { id },
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    // Check access
    const canAccess = await this.canAccessScene(scene, user.id);
    if (!canAccess) {
      throw new ForbiddenException('Access denied');
    }

    // Get data from storage
    const data = await this.storageService.get(
      scene.storageKey,
      this.namespace,
    );

    if (!data) {
      throw new NotFoundException('Scene data not found');
    }

    const stream = new Readable();
    stream.push(data);
    stream.push(null);
    stream.pipe(res);
  }

  /**
   * Create a new scene
   */
  @Post()
  async createScene(
    @Body() dto: CreateSceneDto,
    @CurrentUser() user: User,
  ): Promise<SceneResponse> {
    // If collectionId is provided, check write access
    if (dto.collectionId) {
      await this.collectionsService.requireWriteAccess(
        dto.collectionId,
        user.id,
      );
    }

    // Generate a unique storage key
    const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);
    const storageKey = `ws_${user.id}_${nanoid()}`;

    // If data is provided, store it
    if (dto.data) {
      const dataBuffer =
        typeof dto.data === 'string' ? Buffer.from(dto.data) : dto.data;
      await this.storageService.set(storageKey, dataBuffer, this.namespace);
    }

    // Create scene record
    const scene = await this.prisma.scene.create({
      data: {
        title: dto.title || 'Untitled',
        thumbnailUrl: dto.thumbnail,
        storageKey,
        userId: user.id,
        collectionId: dto.collectionId,
      },
    });

    this.logger.log(`Created scene ${scene.id} for user ${user.email}`);
    return this.toSceneResponse(scene, true);
  }

  /**
   * Update a scene
   */
  @Put(':id')
  async updateScene(
    @Param('id') id: string,
    @Body() dto: UpdateSceneDto,
    @CurrentUser() user: User,
  ): Promise<SceneResponse> {
    const scene = await this.prisma.scene.findUnique({
      where: { id },
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    // Check write access
    const canEdit = await this.canEditScene(scene, user.id);
    if (!canEdit) {
      throw new ForbiddenException('Access denied');
    }

    // If changing collection, check write access to new collection
    if (dto.collectionId && dto.collectionId !== scene.collectionId) {
      await this.collectionsService.requireWriteAccess(
        dto.collectionId,
        user.id,
      );
    }

    // Update storage if data is provided
    if (dto.data) {
      const dataBuffer =
        typeof dto.data === 'string' ? Buffer.from(dto.data) : dto.data;
      await this.storageService.set(
        scene.storageKey,
        dataBuffer,
        this.namespace,
      );
    }

    // Update scene record
    const updatedScene = await this.prisma.scene.update({
      where: { id },
      data: {
        title: dto.title !== undefined ? dto.title : scene.title,
        thumbnailUrl:
          dto.thumbnail !== undefined ? dto.thumbnail : scene.thumbnailUrl,
        collectionId:
          dto.collectionId !== undefined ? dto.collectionId : scene.collectionId,
      },
    });

    this.logger.log(`Updated scene ${id}`);
    return this.toSceneResponse(updatedScene, true);
  }

  /**
   * Update scene data only (for auto-save)
   */
  @Put(':id/data')
  async updateSceneData(
    @Param('id') id: string,
    @Body() data: Buffer,
    @CurrentUser() user: User,
  ): Promise<{ success: boolean }> {
    const scene = await this.prisma.scene.findUnique({
      where: { id },
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    // Check write access
    const canEdit = await this.canEditScene(scene, user.id);
    if (!canEdit) {
      throw new ForbiddenException('Access denied');
    }

    // Update storage
    await this.storageService.set(scene.storageKey, data, this.namespace);

    // Update timestamp
    await this.prisma.scene.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    return { success: true };
  }

  /**
   * Delete a scene
   */
  @Delete(':id')
  async deleteScene(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<{ success: boolean }> {
    const scene = await this.prisma.scene.findUnique({
      where: { id },
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    // Check write access
    const canEdit = await this.canEditScene(scene, user.id);
    if (!canEdit) {
      throw new ForbiddenException('Access denied');
    }

    // Delete from storage
    await this.storageService.delete(scene.storageKey, this.namespace);

    // Delete scene record
    await this.prisma.scene.delete({
      where: { id },
    });

    this.logger.log(`Deleted scene ${id}`);
    return { success: true };
  }

  /**
   * Duplicate a scene
   */
  @Post(':id/duplicate')
  async duplicateScene(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto?: { collectionId?: string },
  ): Promise<SceneResponse> {
    const scene = await this.prisma.scene.findUnique({
      where: { id },
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    // Check read access to source scene
    const canAccess = await this.canAccessScene(scene, user.id);
    if (!canAccess) {
      throw new ForbiddenException('Access denied');
    }

    // If target collection specified, check write access
    const targetCollectionId = dto?.collectionId || scene.collectionId;
    if (targetCollectionId) {
      await this.collectionsService.requireWriteAccess(
        targetCollectionId,
        user.id,
      );
    }

    // Generate a unique storage key for the new scene
    const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);
    const newStorageKey = `ws_${user.id}_${nanoid()}`;

    // Copy scene data from storage
    const originalData = await this.storageService.get(
      scene.storageKey,
      this.namespace,
    );
    if (originalData) {
      await this.storageService.set(
        newStorageKey,
        originalData,
        this.namespace,
      );
    }

    // Create new scene record with "(Copy)" suffix
    const newScene = await this.prisma.scene.create({
      data: {
        title: `${scene.title} (Copy)`,
        thumbnailUrl: scene.thumbnailUrl,
        storageKey: newStorageKey,
        userId: user.id,
        collectionId: targetCollectionId,
        isPublic: false,
      },
    });

    this.logger.log(
      `Duplicated scene ${id} to ${newScene.id} for user ${user.email}`,
    );
    return this.toSceneResponse(newScene, true);
  }

  /**
   * Move a scene to a different collection
   */
  @Put(':id/move')
  async moveScene(
    @Param('id') id: string,
    @Body() dto: { collectionId: string | null },
    @CurrentUser() user: User,
  ): Promise<SceneResponse> {
    const scene = await this.prisma.scene.findUnique({
      where: { id },
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    // Check write access to source
    const canEdit = await this.canEditScene(scene, user.id);
    if (!canEdit) {
      throw new ForbiddenException('Access denied');
    }

    // Check write access to target collection
    if (dto.collectionId) {
      await this.collectionsService.requireWriteAccess(
        dto.collectionId,
        user.id,
      );
    }

    const updatedScene = await this.prisma.scene.update({
      where: { id },
      data: { collectionId: dto.collectionId },
    });

    this.logger.log(`Moved scene ${id} to collection ${dto.collectionId}`);
    return this.toSceneResponse(updatedScene, true);
  }

  /**
   * Start collaboration on a scene (generate room ID)
   */
  @Post(':id/collaborate')
  async startCollaboration(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<{ roomId: string; roomKey: string }> {
    const scene = await this.prisma.scene.findUnique({
      where: { id },
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    // Check write access (only users with write access can start collaboration)
    const canEdit = await this.canEditScene(scene, user.id);
    if (!canEdit) {
      throw new ForbiddenException('Access denied');
    }

    // Generate room ID and key if not exists
    const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 20);
    const roomId = scene.roomId || nanoid();
    const roomKey = nanoid();

    // Update scene with room ID
    await this.prisma.scene.update({
      where: { id },
      data: { roomId },
    });

    this.logger.log(`Started collaboration for scene ${id}`);
    return { roomId, roomKey };
  }

  private toSceneResponse(scene: any, canEdit: boolean): SceneResponse {
    return {
      id: scene.id,
      title: scene.title,
      thumbnailUrl: scene.thumbnailUrl,
      storageKey: scene.storageKey,
      roomId: scene.roomId,
      collectionId: scene.collectionId,
      isPublic: scene.isPublic,
      lastOpenedAt: scene.lastOpenedAt?.toISOString() || null,
      createdAt: scene.createdAt.toISOString(),
      updatedAt: scene.updatedAt.toISOString(),
      canEdit,
    };
  }
}
