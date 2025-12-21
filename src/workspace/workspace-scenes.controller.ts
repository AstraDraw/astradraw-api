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
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { Readable } from 'stream';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'crypto';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { User, WorkspaceRole, WorkspaceType } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import {
  IStorageService,
  STORAGE_SERVICE,
  StorageNamespace,
} from '../storage/storage.interface';
import { CollectionsService } from '../collections/collections.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { TeamsService } from '../teams/teams.service';
import { SceneAccessResult, SceneAccessService } from './scene-access.service';

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

interface CollectionWorkspaceDto {
  targetWorkspaceId: string;
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

interface SceneWithAccessResponse {
  scene: SceneResponse;
  data?: string | null;
  access: SceneAccessResult;
}

@Controller('workspace')
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
    private readonly sceneAccessService: SceneAccessService,
  ) {}

  private getRoomKeySecret(): Buffer {
    const secret = process.env.ROOM_KEY_SECRET || process.env.JWT_SECRET;
    if (!secret) {
      throw new InternalServerErrorException(
        'Room key secret is not configured',
      );
    }
    return createHash('sha256').update(secret).digest();
  }

  private encryptRoomKey(roomKey: string): string {
    const key = this.getRoomKeySecret();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(roomKey, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  private decryptRoomKey(encrypted: string): string {
    const key = this.getRoomKeySecret();
    const buffer = Buffer.from(encrypted, 'base64');
    const iv = buffer.subarray(0, 12);
    const authTag = buffer.subarray(12, 28);
    const ciphertext = buffer.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  /**
   * List scenes for a workspace (filtered by accessible collections)
   */
  @Get('scenes')
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
  @Get('scenes/:id')
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

    const access = await this.sceneAccessService.checkAccess(id, user.id);
    if (!access.canView) {
      throw new ForbiddenException('Access denied');
    }

    await this.prisma.scene.update({
      where: { id },
      data: { lastOpenedAt: new Date() },
    });

    return this.toSceneResponse(scene, access.canEdit);
  }

  /**
   * Load scene by workspace slug (direct URL access)
   */
  @Get('by-slug/:workspaceSlug/scenes/:sceneId')
  async getSceneBySlug(
    @Param('workspaceSlug') workspaceSlug: string,
    @Param('sceneId') sceneId: string,
    @CurrentUser() user: User,
  ): Promise<SceneWithAccessResponse> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const scene = await this.prisma.scene.findUnique({
      where: { id: sceneId },
      include: {
        collection: {
          include: { workspace: true },
        },
      },
    });

    if (!scene || scene.collection?.workspaceId !== workspace.id) {
      throw new NotFoundException('Scene not found');
    }

    const access = await this.sceneAccessService.checkAccess(sceneId, user.id);
    if (!access.canView) {
      throw new ForbiddenException('Access denied');
    }

    await this.prisma.scene.update({
      where: { id: sceneId },
      data: { lastOpenedAt: new Date() },
    });

    const dataBuffer = await this.storageService.get(
      scene.storageKey,
      this.namespace,
    );

    return {
      scene: this.toSceneResponse(scene, access.canEdit),
      data: dataBuffer ? dataBuffer.toString('base64') : null,
      access,
    };
  }

  /**
   * Get scene data (the actual Excalidraw content)
   */
  @Get('scenes/:id/data')
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

    const access = await this.sceneAccessService.checkAccess(id, user.id);
    if (!access.canView) {
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
  @Post('scenes')
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
  @Put('scenes/:id')
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

    const access = await this.sceneAccessService.checkAccess(id, user.id);
    if (!access.canEdit) {
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
          dto.collectionId !== undefined
            ? dto.collectionId
            : scene.collectionId,
      },
    });

    this.logger.log(`Updated scene ${id}`);
    return this.toSceneResponse(updatedScene, access.canEdit);
  }

  /**
   * Update scene data only (for auto-save)
   */
  @Put('scenes/:id/data')
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

    const access = await this.sceneAccessService.checkAccess(id, user.id);
    if (!access.canEdit) {
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
  @Delete('scenes/:id')
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

    const access = await this.sceneAccessService.checkAccess(id, user.id);
    if (!access.canEdit) {
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
  @Post('scenes/:id/duplicate')
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

    const access = await this.sceneAccessService.checkAccess(id, user.id);
    if (!access.canView) {
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
  @Put('scenes/:id/move')
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

    const access = await this.sceneAccessService.checkAccess(id, user.id);
    if (!access.canEdit) {
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
   * Copy a collection (and its scenes) into another workspace
   */
  @Post('collections/:id/copy-to-workspace')
  async copyCollectionToWorkspace(
    @Param('id') collectionId: string,
    @Body() dto: CollectionWorkspaceDto,
    @CurrentUser() user: User,
  ) {
    if (!dto?.targetWorkspaceId) {
      throw new BadRequestException('targetWorkspaceId is required');
    }

    const targetWorkspace = await this.prisma.workspace.findUnique({
      where: { id: dto.targetWorkspaceId },
    });

    if (!targetWorkspace) {
      throw new NotFoundException('Target workspace not found');
    }

    const targetMembership = await this.workspacesService.requireMembership(
      dto.targetWorkspaceId,
      user.id,
    );

    if (targetMembership.role === WorkspaceRole.VIEWER) {
      throw new ForbiddenException(
        'You do not have permission to add collections to the target workspace',
      );
    }

    const sourceCollection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: { scenes: true },
    });

    if (!sourceCollection) {
      throw new NotFoundException('Collection not found');
    }

    const sourceAccess = await this.collectionsService.getCollection(
      collectionId,
      user.id,
    );

    if (!sourceAccess.canWrite) {
      throw new ForbiddenException(
        'You do not have write access to this collection',
      );
    }

    const newCollection = await this.prisma.collection.create({
      data: {
        name: sourceCollection.name,
        icon: sourceCollection.icon,
        color: sourceCollection.color,
        isPrivate: sourceCollection.isPrivate,
        userId: user.id,
        workspaceId: dto.targetWorkspaceId,
      },
    });

    const nanoid16 = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

    for (const scene of sourceCollection.scenes) {
      const newStorageKey = `ws_${user.id}_${nanoid16()}`;
      const sceneData = await this.storageService.get(
        scene.storageKey,
        this.namespace,
      );

      if (sceneData) {
        await this.storageService.set(newStorageKey, sceneData, this.namespace);
      }

      await this.prisma.scene.create({
        data: {
          title: scene.title,
          thumbnailUrl: scene.thumbnailUrl,
          storageKey: newStorageKey,
          userId: user.id,
          collectionId: newCollection.id,
          isPublic: false,
          collaborationEnabled:
            targetWorkspace.type === WorkspaceType.PERSONAL
              ? false
              : (scene.collaborationEnabled ?? true),
          roomId: null,
          roomKeyEncrypted: null,
        },
      });
    }

    this.logger.log(
      `Copied collection ${collectionId} to workspace ${dto.targetWorkspaceId}`,
    );

    return { collectionId: newCollection.id };
  }

  /**
   * Move a collection (and its scenes) into another workspace
   */
  @Post('collections/:id/move-to-workspace')
  async moveCollectionToWorkspace(
    @Param('id') collectionId: string,
    @Body() dto: CollectionWorkspaceDto,
    @CurrentUser() user: User,
  ) {
    if (!dto?.targetWorkspaceId) {
      throw new BadRequestException('targetWorkspaceId is required');
    }

    const targetWorkspace = await this.prisma.workspace.findUnique({
      where: { id: dto.targetWorkspaceId },
    });

    if (!targetWorkspace) {
      throw new NotFoundException('Target workspace not found');
    }

    const targetMembership = await this.workspacesService.requireMembership(
      dto.targetWorkspaceId,
      user.id,
    );

    if (targetMembership.role === WorkspaceRole.VIEWER) {
      throw new ForbiddenException(
        'You do not have permission to move collections to the target workspace',
      );
    }

    const sourceCollection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: { scenes: true },
    });

    if (!sourceCollection) {
      throw new NotFoundException('Collection not found');
    }

    const sourceAccess = await this.collectionsService.getCollection(
      collectionId,
      user.id,
    );

    if (!sourceAccess.canWrite) {
      throw new ForbiddenException(
        'You do not have write access to this collection',
      );
    }

    // Clean up team links that belong to the original workspace
    await this.prisma.teamCollection.deleteMany({
      where: { collectionId },
    });

    await this.prisma.collection.update({
      where: { id: collectionId },
      data: {
        workspaceId: dto.targetWorkspaceId,
        userId: user.id,
      },
    });

    const disableCollab = targetWorkspace.type === WorkspaceType.PERSONAL;

    await this.prisma.scene.updateMany({
      where: { collectionId },
      data: {
        userId: user.id,
        roomId: disableCollab ? null : undefined,
        roomKeyEncrypted: disableCollab ? null : undefined,
        collaborationEnabled: disableCollab ? false : undefined,
      },
    });

    this.logger.log(
      `Moved collection ${collectionId} to workspace ${dto.targetWorkspaceId}`,
    );

    return { collectionId };
  }

  /**
   * Start collaboration on a scene (generate room ID)
   */
  @Post('scenes/:id/collaborate')
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

    const access = await this.sceneAccessService.checkAccess(id, user.id);
    if (!access.canCollaborate) {
      throw new ForbiddenException(
        'Collaboration not available for this scene',
      );
    }

    let roomId = scene.roomId;
    let roomKey: string;

    if (!roomId || !scene.roomKeyEncrypted) {
      const nanoid20 = customAlphabet(
        '0123456789abcdefghijklmnopqrstuvwxyz',
        20,
      );
      const nanoid40 = customAlphabet(
        '0123456789abcdefghijklmnopqrstuvwxyz',
        40,
      );

      roomId = roomId || nanoid20();
      roomKey = nanoid40();

      const encrypted = this.encryptRoomKey(roomKey);

      await this.prisma.scene.update({
        where: { id },
        data: {
          roomId,
          roomKeyEncrypted: encrypted,
        },
      });
    } else {
      roomKey = this.decryptRoomKey(scene.roomKeyEncrypted);
    }

    this.logger.log(`Started collaboration for scene ${id}`);
    return { roomId, roomKey };
  }

  @Get('scenes/:id/collaborate')
  async getCollaborationInfo(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<{ roomId: string; roomKey: string | null } | null> {
    const scene = await this.prisma.scene.findUnique({
      where: { id },
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    const access = await this.sceneAccessService.checkAccess(id, user.id);
    if (!access.canView) {
      throw new ForbiddenException('Access denied');
    }

    if (!scene.roomId || !scene.roomKeyEncrypted) {
      return null;
    }

    const roomKey = this.decryptRoomKey(scene.roomKeyEncrypted);

    return {
      roomId: scene.roomId,
      roomKey: access.canCollaborate ? roomKey : null,
    };
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
