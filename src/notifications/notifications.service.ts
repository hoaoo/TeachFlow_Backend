import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationType } from '@prisma/client';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create an in-app notification.
   * If teacherId is passed instead of userId, automatically resolves the teacher's userId.
   */
  async createNotification(dto: CreateNotificationDto) {
    try {
      let targetUserId = dto.userId;

      if (!targetUserId && dto.teacherId) {
        const teacher = await this.prisma.teacher.findUnique({
          where: { id: dto.teacherId },
          select: { userId: true },
        });
        targetUserId = teacher?.userId;
      }

      if (!targetUserId) {
        this.logger.warn(`Cannot create notification: No target userId found for notification "${dto.title}"`);
        return null;
      }

      const notification = await this.prisma.notification.create({
        data: {
          userId: targetUserId,
          title: dto.title,
          message: dto.message,
          type: dto.type || NotificationType.SYSTEM,
          link: dto.link || null,
        },
      });

      this.logger.log(
        `[NOTIFICATION_CREATED] id=${notification.id} userId=${targetUserId} type=${notification.type} title="${notification.title}"`,
      );

      return notification;
    } catch (err: any) {
      this.logger.warn(`Failed to create notification: ${err?.message}`);
      return null;
    }
  }

  /**
   * Get user's notifications with pagination & filters
   */
  async getUserNotifications(userId: string, query: NotificationQueryDto) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(Math.max(1, query.pageSize || 20), 100);
    const skip = (page - 1) * pageSize;

    const where: any = { userId };

    if (query.type) {
      where.type = query.type;
    }

    if (query.isRead !== undefined) {
      where.isRead = query.isRead;
    }

    const [total, unreadCount, items] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const paginated = new PaginatedResultDto(items, total, page, pageSize);

    return {
      ...paginated,
      unreadCount,
    };
  }

  /**
   * Get total unread count for badge
   */
  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  /**
   * Mark a single notification as read (with IDOR prevention)
   */
  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền cập nhật thông báo của người khác');
    }

    if (notification.isRead) {
      return notification;
    }

    return this.prisma.notification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Mark all unread notifications for a user as read
   */
  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      success: true,
      updatedCount: result.count,
    };
  }

  /**
   * Delete a notification (with IDOR prevention)
   */
  async deleteNotification(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xóa thông báo của người khác');
    }

    await this.prisma.notification.delete({
      where: { id },
    });

    return { success: true, message: 'Đã xóa thông báo thành công' };
  }
}
