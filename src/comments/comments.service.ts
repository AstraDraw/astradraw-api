import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SceneAccessService } from '../workspace/scene-access.service';
import type { CreateThreadDto } from './dto/create-thread.dto';
import type { CreateCommentDto } from './dto/create-comment.dto';
import type { UpdateThreadDto } from './dto/update-thread.dto';
import type { UpdateCommentDto } from './dto/update-comment.dto';

// Response types with user summary for API responses
export interface UserSummary {
  id: string;
  name: string | null;
  avatar: string | null;
}

export interface CommentResponse {
  id: string;
  threadId: string;
  content: string;
  mentions: string[];
  createdBy: UserSummary;
  editedAt: Date | null;
  createdAt: Date;
}

export interface ThreadResponse {
  id: string;
  sceneId: string;
  x: number;
  y: number;
  resolved: boolean;
  resolvedAt: Date | null;
  resolvedBy: UserSummary | null;
  createdBy: UserSummary;
  comments: CommentResponse[];
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sceneAccessService: SceneAccessService,
  ) {}

  // ===========================================================================
  // Thread Operations
  // ===========================================================================

  /**
   * List all threads for a scene
   */
  async listThreads(
    sceneId: string,
    userId: string,
    options?: { resolved?: boolean; sort?: 'date' | 'unread' },
  ): Promise<ThreadResponse[]> {
    // Check scene access
    const access = await this.sceneAccessService.checkAccess(sceneId, userId);
    if (!access.canView) {
      throw new ForbiddenException('You do not have access to this scene');
    }

    const whereClause: { sceneId: string; resolved?: boolean } = { sceneId };
    if (options?.resolved !== undefined) {
      whereClause.resolved = options.resolved;
    }

    const threads = await this.prisma.commentThread.findMany({
      where: whereClause,
      include: {
        createdBy: {
          select: { id: true, name: true, avatarUrl: true },
        },
        resolvedBy: {
          select: { id: true, name: true, avatarUrl: true },
        },
        comments: {
          include: {
            createdBy: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { comments: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return threads.map((thread) => this.mapThreadToResponse(thread));
  }

  /**
   * Get a single thread with all comments
   */
  async getThread(threadId: string, userId: string): Promise<ThreadResponse> {
    const thread = await this.prisma.commentThread.findUnique({
      where: { id: threadId },
      include: {
        createdBy: {
          select: { id: true, name: true, avatarUrl: true },
        },
        resolvedBy: {
          select: { id: true, name: true, avatarUrl: true },
        },
        comments: {
          include: {
            createdBy: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { comments: true },
        },
      },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    // Check scene access
    const access = await this.sceneAccessService.checkAccess(
      thread.sceneId,
      userId,
    );
    if (!access.canView) {
      throw new ForbiddenException('You do not have access to this thread');
    }

    return this.mapThreadToResponse(thread);
  }

  /**
   * Create a new thread with its first comment
   */
  async createThread(
    sceneId: string,
    userId: string,
    dto: CreateThreadDto,
  ): Promise<ThreadResponse> {
    // Check scene access - need edit permission to create comments
    const access = await this.sceneAccessService.checkAccess(sceneId, userId);
    if (!access.canEdit) {
      throw new ForbiddenException(
        'You do not have permission to create comments on this scene',
      );
    }

    // Verify scene exists
    const scene = await this.prisma.scene.findUnique({
      where: { id: sceneId },
    });
    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    // Create thread with first comment in a transaction
    const thread = await this.prisma.commentThread.create({
      data: {
        sceneId,
        x: dto.x,
        y: dto.y,
        createdById: userId,
        comments: {
          create: {
            content: dto.content,
            mentions: dto.mentions ?? [],
            createdById: userId,
          },
        },
      },
      include: {
        createdBy: {
          select: { id: true, name: true, avatarUrl: true },
        },
        resolvedBy: {
          select: { id: true, name: true, avatarUrl: true },
        },
        comments: {
          include: {
            createdBy: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { comments: true },
        },
      },
    });

    this.logger.log(`Created thread ${thread.id} on scene ${sceneId}`);

    return this.mapThreadToResponse(thread);
  }

  /**
   * Update thread position
   */
  async updateThread(
    threadId: string,
    userId: string,
    dto: UpdateThreadDto,
  ): Promise<ThreadResponse> {
    const thread = await this.prisma.commentThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    // Check scene access - need edit permission
    const access = await this.sceneAccessService.checkAccess(
      thread.sceneId,
      userId,
    );
    if (!access.canEdit) {
      throw new ForbiddenException(
        'You do not have permission to update this thread',
      );
    }

    const updated = await this.prisma.commentThread.update({
      where: { id: threadId },
      data: {
        x: dto.x ?? thread.x,
        y: dto.y ?? thread.y,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, avatarUrl: true },
        },
        resolvedBy: {
          select: { id: true, name: true, avatarUrl: true },
        },
        comments: {
          include: {
            createdBy: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { comments: true },
        },
      },
    });

    this.logger.log(`Updated thread ${threadId} position`);

    return this.mapThreadToResponse(updated);
  }

  /**
   * Delete a thread and all its comments
   */
  async deleteThread(threadId: string, userId: string): Promise<void> {
    const thread = await this.prisma.commentThread.findUnique({
      where: { id: threadId },
      include: { scene: true },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    // Check permissions: admin or thread owner can delete
    const isOwner = thread.createdById === userId;

    // Get workspace membership to check admin status
    const scene = await this.prisma.scene.findUnique({
      where: { id: thread.sceneId },
      include: {
        collection: {
          include: {
            workspace: {
              include: {
                members: {
                  where: { userId },
                },
              },
            },
          },
        },
      },
    });

    const isAdmin = scene?.collection?.workspace?.members[0]?.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Only the thread owner or admin can delete this thread',
      );
    }

    await this.prisma.commentThread.delete({
      where: { id: threadId },
    });

    this.logger.log(`Deleted thread ${threadId}`);
  }

  /**
   * Mark thread as resolved
   */
  async resolveThread(
    threadId: string,
    userId: string,
  ): Promise<ThreadResponse> {
    const thread = await this.prisma.commentThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    // Check scene access - need edit permission
    const access = await this.sceneAccessService.checkAccess(
      thread.sceneId,
      userId,
    );
    if (!access.canEdit) {
      throw new ForbiddenException(
        'You do not have permission to resolve this thread',
      );
    }

    const updated = await this.prisma.commentThread.update({
      where: { id: threadId },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolvedById: userId,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, avatarUrl: true },
        },
        resolvedBy: {
          select: { id: true, name: true, avatarUrl: true },
        },
        comments: {
          include: {
            createdBy: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { comments: true },
        },
      },
    });

    this.logger.log(`Resolved thread ${threadId}`);

    return this.mapThreadToResponse(updated);
  }

  /**
   * Reopen a resolved thread
   */
  async reopenThread(
    threadId: string,
    userId: string,
  ): Promise<ThreadResponse> {
    const thread = await this.prisma.commentThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    // Check scene access - need edit permission
    const access = await this.sceneAccessService.checkAccess(
      thread.sceneId,
      userId,
    );
    if (!access.canEdit) {
      throw new ForbiddenException(
        'You do not have permission to reopen this thread',
      );
    }

    const updated = await this.prisma.commentThread.update({
      where: { id: threadId },
      data: {
        resolved: false,
        resolvedAt: null,
        resolvedById: null,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, avatarUrl: true },
        },
        resolvedBy: {
          select: { id: true, name: true, avatarUrl: true },
        },
        comments: {
          include: {
            createdBy: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { comments: true },
        },
      },
    });

    this.logger.log(`Reopened thread ${threadId}`);

    return this.mapThreadToResponse(updated);
  }

  // ===========================================================================
  // Comment Operations
  // ===========================================================================

  /**
   * Add a comment (reply) to a thread
   */
  async addComment(
    threadId: string,
    userId: string,
    dto: CreateCommentDto,
  ): Promise<CommentResponse> {
    const thread = await this.prisma.commentThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    // Check scene access - need edit permission
    const access = await this.sceneAccessService.checkAccess(
      thread.sceneId,
      userId,
    );
    if (!access.canEdit) {
      throw new ForbiddenException(
        'You do not have permission to add comments to this thread',
      );
    }

    const comment = await this.prisma.comment.create({
      data: {
        threadId,
        content: dto.content,
        mentions: dto.mentions ?? [],
        createdById: userId,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    // Update thread's updatedAt timestamp
    await this.prisma.commentThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    this.logger.log(`Added comment ${comment.id} to thread ${threadId}`);

    return this.mapCommentToResponse(comment);
  }

  /**
   * Update a comment's content
   */
  async updateComment(
    commentId: string,
    userId: string,
    dto: UpdateCommentDto,
  ): Promise<CommentResponse> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { thread: true },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    // Only the comment owner can edit
    if (comment.createdById !== userId) {
      throw new ForbiddenException('Only the comment author can edit');
    }

    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: {
        content: dto.content,
        editedAt: new Date(),
      },
      include: {
        createdBy: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    this.logger.log(`Updated comment ${commentId}`);

    return this.mapCommentToResponse(updated);
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string, userId: string): Promise<void> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        thread: {
          include: {
            scene: {
              include: {
                collection: {
                  include: {
                    workspace: {
                      include: {
                        members: {
                          where: { userId },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    // Check permissions: admin or comment owner can delete
    const isOwner = comment.createdById === userId;
    const isAdmin =
      comment.thread.scene.collection?.workspace?.members[0]?.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Only the comment author or admin can delete this comment',
      );
    }

    // Check if this is the last comment in the thread
    const commentCount = await this.prisma.comment.count({
      where: { threadId: comment.threadId },
    });

    if (commentCount === 1) {
      // If it's the last comment, delete the entire thread
      await this.prisma.commentThread.delete({
        where: { id: comment.threadId },
      });
      this.logger.log(
        `Deleted thread ${comment.threadId} (last comment removed)`,
      );
    } else {
      // Otherwise just delete the comment
      await this.prisma.comment.delete({
        where: { id: commentId },
      });
      this.logger.log(`Deleted comment ${commentId}`);
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private mapThreadToResponse(thread: {
    id: string;
    sceneId: string;
    x: number;
    y: number;
    resolved: boolean;
    resolvedAt: Date | null;
    resolvedBy: {
      id: string;
      name: string | null;
      avatarUrl: string | null;
    } | null;
    createdBy: { id: string; name: string | null; avatarUrl: string | null };
    comments: Array<{
      id: string;
      threadId: string;
      content: string;
      mentions: string[];
      editedAt: Date | null;
      createdAt: Date;
      createdBy: { id: string; name: string | null; avatarUrl: string | null };
    }>;
    _count: { comments: number };
    createdAt: Date;
    updatedAt: Date;
  }): ThreadResponse {
    return {
      id: thread.id,
      sceneId: thread.sceneId,
      x: thread.x,
      y: thread.y,
      resolved: thread.resolved,
      resolvedAt: thread.resolvedAt,
      resolvedBy: thread.resolvedBy
        ? {
            id: thread.resolvedBy.id,
            name: thread.resolvedBy.name,
            avatar: thread.resolvedBy.avatarUrl,
          }
        : null,
      createdBy: {
        id: thread.createdBy.id,
        name: thread.createdBy.name,
        avatar: thread.createdBy.avatarUrl,
      },
      comments: thread.comments.map((c) => this.mapCommentToResponse(c)),
      commentCount: thread._count.comments,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
  }

  private mapCommentToResponse(comment: {
    id: string;
    threadId: string;
    content: string;
    mentions: string[];
    editedAt: Date | null;
    createdAt: Date;
    createdBy: { id: string; name: string | null; avatarUrl: string | null };
  }): CommentResponse {
    return {
      id: comment.id,
      threadId: comment.threadId,
      content: comment.content,
      mentions: comment.mentions,
      createdBy: {
        id: comment.createdBy.id,
        name: comment.createdBy.name,
        avatar: comment.createdBy.avatarUrl,
      },
      editedAt: comment.editedAt,
      createdAt: comment.createdAt,
    };
  }
}
