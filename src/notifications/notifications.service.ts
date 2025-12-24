import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, NotificationType } from '@prisma/client';

// Response types for API responses
export interface UserSummary {
  id: string;
  name: string | null;
  avatar: string | null;
}

export interface NotificationResponse {
  id: string;
  type: NotificationType;
  actor: UserSummary;
  thread: { id: string } | null;
  comment: { id: string } | null;
  scene: {
    id: string;
    name: string;
  };
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationsListResponse {
  notifications: NotificationResponse[];
  nextCursor: string | undefined;
  hasMore: boolean;
}

export interface CreateMentionNotificationsParams {
  actorId: string;
  mentions: string[];
  threadId: string;
  commentId: string;
  sceneId: string;
}

export interface CreateCommentNotificationsParams {
  actorId: string;
  participants: string[];
  threadId: string;
  commentId: string;
  sceneId: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // Notification Creation (for Phase 2 - Comment Integration)
  // ===========================================================================

  /**
   * Create MENTION notifications for @mentioned users
   */
  async createMentionNotifications(
    params: CreateMentionNotificationsParams,
  ): Promise<void> {
    const { actorId, mentions, threadId, commentId, sceneId } = params;

    // Filter out self-mentions
    const recipients = mentions.filter((id) => id !== actorId);
    if (recipients.length === 0) return;

    await this.prisma.notification.createMany({
      data: recipients.map((userId) => ({
        type: NotificationType.MENTION,
        userId,
        actorId,
        threadId,
        commentId,
        sceneId,
      })),
    });

    this.logger.log(
      `Created ${recipients.length} MENTION notifications for comment ${commentId}`,
    );
  }

  /**
   * Create COMMENT notifications for thread participants
   */
  async createCommentNotifications(
    params: CreateCommentNotificationsParams,
  ): Promise<void> {
    const { actorId, participants, threadId, commentId, sceneId } = params;

    // Filter out the comment author
    const recipients = participants.filter((id) => id !== actorId);
    if (recipients.length === 0) return;

    await this.prisma.notification.createMany({
      data: recipients.map((userId) => ({
        type: NotificationType.COMMENT,
        userId,
        actorId,
        threadId,
        commentId,
        sceneId,
      })),
    });

    this.logger.log(
      `Created ${recipients.length} COMMENT notifications for comment ${commentId}`,
    );
  }

  // ===========================================================================
  // Notification Retrieval
  // ===========================================================================

  /**
   * List notifications for a user with cursor pagination
   */
  async listNotifications(
    userId: string,
    options?: { cursor?: string; limit?: number; unread?: boolean },
  ): Promise<NotificationsListResponse> {
    const limit = options?.limit ?? 20;

    const where: Prisma.NotificationWhereInput = { userId };
    if (options?.unread) {
      where.read = false;
    }

    // Build query with includes
    const baseQuery = {
      where,
      include: {
        actor: { select: { id: true, name: true, avatarUrl: true } },
        thread: { select: { id: true } },
        comment: { select: { id: true } },
        scene: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' as const },
      take: limit + 1, // Fetch one extra to check hasMore
    };

    // For cursor-based pagination
    const queryWithCursor = options?.cursor
      ? {
          ...baseQuery,
          cursor: { id: options.cursor },
          skip: 1, // Skip the cursor item itself
        }
      : baseQuery;

    const notifications =
      await this.prisma.notification.findMany(queryWithCursor);

    const hasMore = notifications.length > limit;
    const items = hasMore ? notifications.slice(0, -1) : notifications;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    return {
      notifications: items.map((n) => this.mapToResponse(n)),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  // ===========================================================================
  // Notification Actions
  // ===========================================================================

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true, readAt: new Date() },
    });

    if (result.count > 0) {
      this.logger.log(`Marked notification ${notificationId} as read`);
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });

    this.logger.log(
      `Marked ${result.count} notifications as read for user ${userId}`,
    );
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private mapToResponse(notification: {
    id: string;
    type: NotificationType;
    actor: { id: string; name: string | null; avatarUrl: string | null };
    thread: { id: string } | null;
    comment: { id: string } | null;
    scene: { id: string; title: string };
    read: boolean;
    readAt: Date | null;
    createdAt: Date;
  }): NotificationResponse {
    return {
      id: notification.id,
      type: notification.type,
      actor: {
        id: notification.actor.id,
        name: notification.actor.name,
        avatar: notification.actor.avatarUrl,
      },
      thread: notification.thread,
      comment: notification.comment,
      scene: {
        id: notification.scene.id,
        name: notification.scene.title,
      },
      read: notification.read,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    };
  }
}
