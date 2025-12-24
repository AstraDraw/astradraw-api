import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '@prisma/client';
import {
  CommentsService,
  ThreadResponse,
  CommentResponse,
} from './comments.service';
import { parseFields, filterResponseArray } from '../utils/field-filter';
import type { CreateThreadDto } from './dto/create-thread.dto';
import type { CreateCommentDto } from './dto/create-comment.dto';
import type { UpdateThreadDto } from './dto/update-thread.dto';
import type { UpdateCommentDto } from './dto/update-comment.dto';

// Allowed fields for thread list filtering
const THREAD_FIELDS = [
  'id',
  'sceneId',
  'x',
  'y',
  'resolved',
  'resolvedAt',
  'resolvedBy',
  'createdBy',
  'comments',
  'commentCount',
  'createdAt',
  'updatedAt',
] as const;

@Controller()
@UseGuards(JwtAuthGuard)
export class CommentsController {
  private readonly logger = new Logger(CommentsController.name);

  constructor(private readonly commentsService: CommentsService) {}

  // ===========================================================================
  // Thread Endpoints
  // ===========================================================================

  /**
   * List all threads for a scene
   * GET /api/v2/scenes/:sceneId/threads
   *
   * Query params:
   * - resolved: boolean - Filter by resolved status
   * - sort: 'date' | 'unread' - Sort order
   * - fields: string - Comma-separated list of fields to include
   */
  @Get('scenes/:sceneId/threads')
  async listThreads(
    @Param('sceneId') sceneId: string,
    @CurrentUser() user: User,
    @Query('resolved') resolved?: string,
    @Query('sort') sort?: 'date' | 'unread',
    @Query('fields') fieldsParam?: string,
  ): Promise<Partial<ThreadResponse>[]> {
    const options = {
      resolved: resolved !== undefined ? resolved === 'true' : undefined,
      sort,
    };

    const threads = await this.commentsService.listThreads(
      sceneId,
      user.id,
      options,
    );

    const fields = parseFields(fieldsParam, THREAD_FIELDS);
    return filterResponseArray(threads, fields);
  }

  /**
   * Create a new thread with first comment
   * POST /api/v2/scenes/:sceneId/threads
   */
  @Post('scenes/:sceneId/threads')
  async createThread(
    @Param('sceneId') sceneId: string,
    @Body() dto: CreateThreadDto,
    @CurrentUser() user: User,
  ): Promise<ThreadResponse> {
    this.logger.log(
      `Creating thread: x=${dto.x}, y=${dto.y}, mentions=${JSON.stringify(dto.mentions)}`,
    );
    return this.commentsService.createThread(sceneId, user.id, dto);
  }

  /**
   * Get a single thread with all comments
   * GET /api/v2/threads/:threadId
   */
  @Get('threads/:threadId')
  async getThread(
    @Param('threadId') threadId: string,
    @CurrentUser() user: User,
  ): Promise<ThreadResponse> {
    return this.commentsService.getThread(threadId, user.id);
  }

  /**
   * Update thread position
   * PATCH /api/v2/threads/:threadId
   */
  @Patch('threads/:threadId')
  async updateThread(
    @Param('threadId') threadId: string,
    @Body() dto: UpdateThreadDto,
    @CurrentUser() user: User,
  ): Promise<ThreadResponse> {
    return this.commentsService.updateThread(threadId, user.id, dto);
  }

  /**
   * Delete a thread and all its comments
   * DELETE /api/v2/threads/:threadId
   */
  @Delete('threads/:threadId')
  async deleteThread(
    @Param('threadId') threadId: string,
    @CurrentUser() user: User,
  ): Promise<{ success: boolean }> {
    await this.commentsService.deleteThread(threadId, user.id);
    return { success: true };
  }

  /**
   * Mark thread as resolved
   * POST /api/v2/threads/:threadId/resolve
   */
  @Post('threads/:threadId/resolve')
  async resolveThread(
    @Param('threadId') threadId: string,
    @CurrentUser() user: User,
  ): Promise<ThreadResponse> {
    return this.commentsService.resolveThread(threadId, user.id);
  }

  /**
   * Reopen a resolved thread
   * POST /api/v2/threads/:threadId/reopen
   */
  @Post('threads/:threadId/reopen')
  async reopenThread(
    @Param('threadId') threadId: string,
    @CurrentUser() user: User,
  ): Promise<ThreadResponse> {
    return this.commentsService.reopenThread(threadId, user.id);
  }

  // ===========================================================================
  // Comment Endpoints
  // ===========================================================================

  /**
   * Add a comment (reply) to a thread
   * POST /api/v2/threads/:threadId/comments
   */
  @Post('threads/:threadId/comments')
  async addComment(
    @Param('threadId') threadId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: User,
  ): Promise<CommentResponse> {
    return this.commentsService.addComment(threadId, user.id, dto);
  }

  /**
   * Update a comment's content
   * PATCH /api/v2/comments/:commentId
   */
  @Patch('comments/:commentId')
  async updateComment(
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: User,
  ): Promise<CommentResponse> {
    return this.commentsService.updateComment(commentId, user.id, dto);
  }

  /**
   * Delete a comment
   * DELETE /api/v2/comments/:commentId
   */
  @Delete('comments/:commentId')
  async deleteComment(
    @Param('commentId') commentId: string,
    @CurrentUser() user: User,
  ): Promise<{ success: boolean }> {
    await this.commentsService.deleteComment(commentId, user.id);
    return { success: true };
  }
}
