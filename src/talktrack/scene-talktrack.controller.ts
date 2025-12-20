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
  InternalServerErrorException,
  Headers,
} from '@nestjs/common';
import axios from 'axios';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';
import { getSecret } from '../utils/secrets';

// DTOs
interface CreateTalktrackDto {
  title: string;
  kinescopeVideoId: string;
  duration: number;
  processingStatus?: string;
}

interface UpdateTalktrackDto {
  title?: string;
  processingStatus?: string;
}

interface TalktrackResponse {
  id: string;
  title: string;
  kinescopeVideoId: string;
  duration: number;
  processingStatus: string;
  sceneId: string;
  userId: string;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}

@Controller('workspace/scenes/:sceneId/talktracks')
@UseGuards(JwtAuthGuard)
export class SceneTalktrackController {
  private readonly logger = new Logger(SceneTalktrackController.name);
  private readonly kinescopeApiKey: string;
  private readonly kinescopeApiUrl = 'https://api.kinescope.io/v1';

  constructor(private readonly prisma: PrismaService) {
    this.kinescopeApiKey = getSecret('KINESCOPE_API_KEY') || '';
  }

  /**
   * Get all talktrack recordings for a scene
   * Scene owner and viewers (if public) can access
   */
  @Get()
  async listTalktracks(
    @Param('sceneId') sceneId: string,
    @CurrentUser() user: User,
  ): Promise<TalktrackResponse[]> {
    const scene = await this.prisma.scene.findUnique({
      where: { id: sceneId },
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    // Check access: owner or public scene
    if (scene.userId !== user.id && !scene.isPublic) {
      throw new ForbiddenException('Access denied');
    }

    const recordings = await this.prisma.talktrackRecording.findMany({
      where: { sceneId },
      orderBy: { createdAt: 'desc' },
    });

    return recordings.map((r) => this.toResponse(r, user.id));
  }

  /**
   * Create a new talktrack recording for a scene
   * Only scene owner can create
   */
  @Post()
  async createTalktrack(
    @Param('sceneId') sceneId: string,
    @Body() dto: CreateTalktrackDto,
    @CurrentUser() user: User,
  ): Promise<TalktrackResponse> {
    const scene = await this.prisma.scene.findUnique({
      where: { id: sceneId },
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    // Only owner can create recordings
    if (scene.userId !== user.id) {
      throw new ForbiddenException('Only scene owner can create recordings');
    }

    const recording = await this.prisma.talktrackRecording.create({
      data: {
        title: dto.title,
        kinescopeVideoId: dto.kinescopeVideoId,
        duration: dto.duration,
        processingStatus: dto.processingStatus || 'processing',
        sceneId,
        userId: user.id,
      },
    });

    this.logger.log(
      `Created talktrack recording ${recording.id} for scene ${sceneId}`,
    );
    return this.toResponse(recording, user.id);
  }

  /**
   * Get a specific talktrack recording
   */
  @Get(':id')
  async getTalktrack(
    @Param('sceneId') sceneId: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<TalktrackResponse> {
    const scene = await this.prisma.scene.findUnique({
      where: { id: sceneId },
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    // Check access: owner or public scene
    if (scene.userId !== user.id && !scene.isPublic) {
      throw new ForbiddenException('Access denied');
    }

    const recording = await this.prisma.talktrackRecording.findFirst({
      where: { id, sceneId },
    });

    if (!recording) {
      throw new NotFoundException('Recording not found');
    }

    return this.toResponse(recording, user.id);
  }

  /**
   * Update a talktrack recording (title or status)
   * Only recording owner can update
   */
  @Put(':id')
  async updateTalktrack(
    @Param('sceneId') sceneId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTalktrackDto,
    @CurrentUser() user: User,
  ): Promise<TalktrackResponse> {
    const recording = await this.prisma.talktrackRecording.findFirst({
      where: { id, sceneId },
    });

    if (!recording) {
      throw new NotFoundException('Recording not found');
    }

    // Only recording owner can update
    if (recording.userId !== user.id) {
      throw new ForbiddenException('Only recording owner can update');
    }

    const updated = await this.prisma.talktrackRecording.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.processingStatus !== undefined && {
          processingStatus: dto.processingStatus,
        }),
      },
    });

    this.logger.log(`Updated talktrack recording ${id}`);
    return this.toResponse(updated, user.id);
  }

  /**
   * Delete a talktrack recording
   * Only recording owner can delete
   * Also deletes from Kinescope
   */
  @Delete(':id')
  async deleteTalktrack(
    @Param('sceneId') sceneId: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<{ success: boolean }> {
    const recording = await this.prisma.talktrackRecording.findFirst({
      where: { id, sceneId },
    });

    if (!recording) {
      throw new NotFoundException('Recording not found');
    }

    // Only recording owner can delete
    if (recording.userId !== user.id) {
      throw new ForbiddenException('Only recording owner can delete');
    }

    // Delete from Kinescope first
    if (this.kinescopeApiKey) {
      try {
        await axios.delete(
          `${this.kinescopeApiUrl}/videos/${recording.kinescopeVideoId}`,
          {
            headers: {
              Authorization: `Bearer ${this.kinescopeApiKey}`,
            },
          },
        );
        this.logger.log(
          `Deleted video ${recording.kinescopeVideoId} from Kinescope`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to delete from Kinescope: ${error.message}`,
        );
        // Continue with database deletion even if Kinescope fails
      }
    }

    // Delete from database
    await this.prisma.talktrackRecording.delete({
      where: { id },
    });

    this.logger.log(`Deleted talktrack recording ${id}`);
    return { success: true };
  }

  /**
   * Update processing status for a recording (called by status polling)
   */
  @Put(':id/status')
  async updateStatus(
    @Param('sceneId') sceneId: string,
    @Param('id') id: string,
    @Body() body: { status: string },
    @CurrentUser() user: User,
  ): Promise<TalktrackResponse> {
    const recording = await this.prisma.talktrackRecording.findFirst({
      where: { id, sceneId },
    });

    if (!recording) {
      throw new NotFoundException('Recording not found');
    }

    // Only recording owner can update status
    if (recording.userId !== user.id) {
      throw new ForbiddenException('Only recording owner can update status');
    }

    const updated = await this.prisma.talktrackRecording.update({
      where: { id },
      data: { processingStatus: body.status },
    });

    return this.toResponse(updated, user.id);
  }

  private toResponse(recording: any, currentUserId: string): TalktrackResponse {
    return {
      id: recording.id,
      title: recording.title,
      kinescopeVideoId: recording.kinescopeVideoId,
      duration: recording.duration,
      processingStatus: recording.processingStatus,
      sceneId: recording.sceneId,
      userId: recording.userId,
      isOwner: recording.userId === currentUserId,
      createdAt: recording.createdAt.toISOString(),
      updatedAt: recording.updatedAt.toISOString(),
    };
  }
}

