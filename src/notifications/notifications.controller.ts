import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '@prisma/client';
import {
  NotificationsService,
  NotificationsListResponse,
} from './notifications.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * List notifications for the current user
   * GET /api/v2/notifications
   *
   * Query params:
   * - limit: number (default 20)
   * - cursor: string (notification ID for pagination)
   * - unread: boolean (filter unread only)
   */
  @Get('notifications')
  async listNotifications(
    @CurrentUser() user: User,
    @Query('limit') limitParam?: string,
    @Query('cursor') cursor?: string,
    @Query('unread') unreadParam?: string,
  ): Promise<NotificationsListResponse> {
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    const unread = unreadParam === 'true';

    return this.notificationsService.listNotifications(user.id, {
      limit,
      cursor,
      unread,
    });
  }

  /**
   * Get unread notification count for badge
   * GET /api/v2/notifications/unread-count
   */
  @Get('notifications/unread-count')
  async getUnreadCount(@CurrentUser() user: User): Promise<{ count: number }> {
    const count = await this.notificationsService.getUnreadCount(user.id);
    return { count };
  }

  /**
   * Mark a single notification as read
   * POST /api/v2/notifications/:id/read
   */
  @Post('notifications/:id/read')
  async markAsRead(
    @Param('id') notificationId: string,
    @CurrentUser() user: User,
  ): Promise<{ success: boolean }> {
    await this.notificationsService.markAsRead(notificationId, user.id);
    return { success: true };
  }

  /**
   * Mark all notifications as read
   * POST /api/v2/notifications/read-all
   */
  @Post('notifications/read-all')
  async markAllAsRead(
    @CurrentUser() user: User,
  ): Promise<{ success: boolean }> {
    await this.notificationsService.markAllAsRead(user.id);
    return { success: true };
  }
}
