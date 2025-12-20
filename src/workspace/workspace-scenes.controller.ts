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
import { User } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import {
  IStorageService,
  STORAGE_SERVICE,
  StorageNamespace,
} from '../storage/storage.interface';

// DTOs
interface CreateSceneDto {
  title?: string;
  thumbnail?: string;
  data?: Buffer | string; // Scene data (optional, can be provided later)
}

interface UpdateSceneDto {
  title?: string;
  thumbnail?: string;
  data?: Buffer | string;
}

interface SceneResponse {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  storageKey: string;
  roomId: string | null;
  isPublic: boolean;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

@Controller('workspace/scenes')
@UseGuards(JwtAuthGuard)
export class WorkspaceScenesController {
  private readonly logger = new Logger(WorkspaceScenesController.name);
  private readonly namespace = StorageNamespace.SCENES;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  /**
   * List all scenes for the current user
   */
  @Get()
  async listScenes(@CurrentUser() user: User): Promise<SceneResponse[]> {
    const scenes = await this.prisma.scene.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
    });

    return scenes.map(this.toSceneResponse);
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

    // Check ownership or public access
    if (scene.userId !== user.id && !scene.isPublic) {
      throw new ForbiddenException('Access denied');
    }

    // Update last opened timestamp
    await this.prisma.scene.update({
      where: { id },
      data: { lastOpenedAt: new Date() },
    });

    return this.toSceneResponse(scene);
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

    // Check ownership or public access
    if (scene.userId !== user.id && !scene.isPublic) {
      throw new ForbiddenException('Access denied');
    }

    // Get data from storage
    const data = await this.storageService.get(scene.storageKey, this.namespace);

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
    // Generate a unique storage key
    const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);
    const storageKey = `ws_${user.id}_${nanoid()}`;

    // If data is provided, store it
    if (dto.data) {
      const dataBuffer = typeof dto.data === 'string' 
        ? Buffer.from(dto.data)
        : dto.data;
      await this.storageService.set(storageKey, dataBuffer, this.namespace);
    }

    // Create scene record
    const scene = await this.prisma.scene.create({
      data: {
        title: dto.title || 'Untitled',
        thumbnailUrl: dto.thumbnail,
        storageKey,
        userId: user.id,
      },
    });

    this.logger.log(`Created scene ${scene.id} for user ${user.email}`);
    return this.toSceneResponse(scene);
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

    if (scene.userId !== user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Update storage if data is provided
    if (dto.data) {
      const dataBuffer = typeof dto.data === 'string'
        ? Buffer.from(dto.data)
        : dto.data;
      await this.storageService.set(scene.storageKey, dataBuffer, this.namespace);
    }

    // Update scene record
    const updatedScene = await this.prisma.scene.update({
      where: { id },
      data: {
        title: dto.title !== undefined ? dto.title : scene.title,
        thumbnailUrl: dto.thumbnail !== undefined ? dto.thumbnail : scene.thumbnailUrl,
      },
    });

    this.logger.log(`Updated scene ${id}`);
    return this.toSceneResponse(updatedScene);
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

    if (scene.userId !== user.id) {
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

    if (scene.userId !== user.id) {
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

    if (scene.userId !== user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Generate room ID and key if not exists
    const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 20);
    const roomId = scene.roomId || nanoid();
    const roomKey = nanoid(); // Always generate new key for security

    // Update scene with room ID
    await this.prisma.scene.update({
      where: { id },
      data: { roomId },
    });

    this.logger.log(`Started collaboration for scene ${id}`);
    return { roomId, roomKey };
  }

  private toSceneResponse(scene: any): SceneResponse {
    return {
      id: scene.id,
      title: scene.title,
      thumbnailUrl: scene.thumbnailUrl,
      storageKey: scene.storageKey,
      roomId: scene.roomId,
      isPublic: scene.isPublic,
      lastOpenedAt: scene.lastOpenedAt?.toISOString() || null,
      createdAt: scene.createdAt.toISOString(),
      updatedAt: scene.updatedAt.toISOString(),
    };
  }
}
