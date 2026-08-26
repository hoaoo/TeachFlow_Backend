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

export type MobileTargetType =
  | 'ATTENDANCE'
  | 'STUDENT'
  | 'LESSON_PLAN'
  | 'SCHEDULE'
  | 'TASK'
  | 'WORKSHEET'
  | 'HOMEROOM'
  | 'SYSTEM';

export interface MobileNotificationPayload {
  id: string;
  userId: string;
  title: string;
  message: string;
  body: string; // Mobile native alias
  type: NotificationType;
  targetType: MobileTargetType;
  targetId: string | null;
  metadata: Record<string, any>;
  link: string | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Parse domain deep link and target metadata for mobile native navigation
   */
  private formatNotification(n: any): MobileNotificationPayload {
    let targetType: MobileTargetType = 'SYSTEM';
    let targetId: string | null = null;
    const metadata: Record<string, any> = {};

    if (n.link) {
      if (n.link.includes('attendance') || n.link.includes('homeroom')) {
        targetType = 'ATTENDANCE';
        const match = n.link.match(/classroomId=([a-zA-Z0-9_-]+)/);
        if (match) {
          targetId = match[1];
          metadata.classroomId = match[1];
        }
      } else if (n.link.includes('students')) {
        targetType = 'STUDENT';
        const match =
          n.link.match(/\/students\/([a-zA-Z0-9_-]+)/) ||
          n.link.match(/studentId=([a-zA-Z0-9_-]+)/);
        if (match) {
          targetId = match[1];
          metadata.studentId = match[1];
        }
      } else if (n.link.includes('schedule')) {
        targetType = 'SCHEDULE';
        const match = n.link.match(/scheduleId=([a-zA-Z0-9_-]+)/);
        if (match) {
          targetId = match[1];
          metadata.scheduleId = match[1];
        }
      } else if (n.link.includes('lessons') || n.link.includes('lesson-plans')) {
        targetType = 'LESSON_PLAN';
        const match =
          n.link.match(/\/lessons?\/([a-zA-Z0-9_-]+)/) ||
          n.link.match(/lessonPlanId=([a-zA-Z0-9_-]+)/);
        if (match) {
          targetId = match[1];
          metadata.lessonPlanId = match[1];
        }
      } else if (n.link.includes('tasks')) {
        targetType = 'TASK';
        const match = n.link.match(/taskId=([a-zA-Z0-9_-]+)/);
        if (match) {
          targetId = match[1];
          metadata.taskId = match[1];
        }
      } else if (n.link.includes('worksheets')) {
        targetType = 'WORKSHEET';
        const match = n.link.match(/worksheetId=([a-zA-Z0-9_-]+)/);
        if (match) {
          targetId = match[1];
          metadata.worksheetId = match[1];
        }
      }
    } else {
      // Fallback by type
      if (n.type === NotificationType.HOMEROOM) targetType = 'HOMEROOM';
      else if (n.type === NotificationType.ASSIGNMENT) targetType = 'SCHEDULE';
      else if (n.type === NotificationType.TASK) targetType = 'TASK';
      else if (n.type === NotificationType.ENROLLMENT) targetType = 'STUDENT';
      else if (n.type === NotificationType.ASSESSMENT) targetType = 'STUDENT';
    }

    return {
      id: n.id,
      userId: n.userId,
      title: n.title,
      message: n.message,
      body: n.message,
      type: n.type,
      targetType,
      targetId,
      metadata,
      link: n.link,
      isRead: n.isRead,
      readAt: n.readAt,
      createdAt: n.createdAt,
    };
  }

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

      return this.formatNotification(notification);
    } catch (err: any) {
      this.logger.warn(`Failed to create notification: ${err?.message}`);
      return null;
    }
  }

  /**
   * Idempotently generates smart reminders for the teacher (Attendance, Schedule, Birthday, Tasks, Worksheets)
   */
  async generateTeacherReminders(userId: string, providedTeacherId?: string) {
    try {
      let teacherId = providedTeacherId;
      if (!teacherId) {
        const teacher = await this.prisma.teacher.findUnique({
          where: { userId },
          select: { id: true },
        });
        teacherId = teacher?.id;
      }

      if (!teacherId) return;

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

      // Fetch today's existing notifications to ensure 100% idempotency
      const existingToday = await this.prisma.notification.findMany({
        where: {
          userId,
          createdAt: { gte: todayStart },
        },
        select: { title: true, link: true },
      });
      const existingKeySet = new Set(existingToday.map((n) => `${n.title}|${n.link || ''}`));

      const notificationsToCreate: Array<{
        title: string;
        message: string;
        type: NotificationType;
        link: string;
      }> = [];

      // 1. Check Attendance: homeroom & teaching classrooms without attendance session today
      const classrooms = await this.prisma.classroom.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          OR: [{ teacherId }, { homeroomTeacherId: teacherId }],
        },
        include: {
          attendanceSessions: {
            where: {
              attendanceDate: {
                gte: todayStart,
                lte: todayEnd,
              },
            },
          },
        },
      });

      for (const c of classrooms) {
        if (!c.attendanceSessions.length) {
          const title = `Bạn chưa điểm danh lớp ${c.name} hôm nay`;
          const link = `/homeroom?tab=attendance&classroomId=${c.id}`;
          if (!existingKeySet.has(`${title}|${link}`)) {
            notificationsToCreate.push({
              title,
              message: `Hôm nay bạn chưa có phiên điểm danh nào cho lớp ${c.name}. Nhấn để điểm danh cho học sinh.`,
              type: NotificationType.HOMEROOM,
              link,
            });
            existingKeySet.add(`${title}|${link}`);
          }
        }
      }

      // 2. Check Upcoming Schedules for Today
      const todaySchedules = await this.prisma.schedule.findMany({
        where: {
          teacherId,
          deletedAt: null,
          plannedDate: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
        include: {
          classroom: { select: { name: true } },
        },
        orderBy: { startTime: 'asc' },
      });

      for (const s of todaySchedules) {
        const title = `Tiết ${s.title || 'dạy'} lớp ${s.classroom?.name || ''} lúc ${s.startTime}`;
        const link = `/schedule?scheduleId=${s.id}`;
        if (!existingKeySet.has(`${title}|${link}`)) {
          notificationsToCreate.push({
            title,
            message: `Tiết dạy dự kiến bắt đầu lúc ${s.startTime} tại phòng ${s.room || 'học'}.`,
            type: NotificationType.ASSIGNMENT,
            link,
          });
          existingKeySet.add(`${title}|${link}`);
        }
      }

      // 3. Check Student Birthdays Today
      const allActiveStudents = await this.prisma.student.findMany({
        where: {
          deletedAt: null,
          classStudents: {
            some: {
              status: 'ACTIVE',
              classroom: {
                deletedAt: null,
                OR: [{ teacherId }, { homeroomTeacherId: teacherId }],
              },
            },
          },
        },
        include: {
          classStudents: {
            where: { status: 'ACTIVE' },
            include: { classroom: { select: { name: true } } },
          },
        },
      });

      const todayMonth = now.getMonth() + 1;
      const todayDay = now.getDate();

      for (const student of allActiveStudents) {
        if (student.dateOfBirth) {
          const dob = new Date(student.dateOfBirth);
          if (dob.getMonth() + 1 === todayMonth && dob.getDate() === todayDay) {
            const className = student.classStudents[0]?.classroom?.name || '';
            const title = `Hôm nay là sinh nhật em ${student.fullName} (${className})`;
            const link = `/students/${student.id}`;
            if (!existingKeySet.has(`${title}|${link}`)) {
              notificationsToCreate.push({
                title,
                message: `Học sinh ${student.fullName} tròn tuổi mới hôm nay. Hãy gửi lời chúc mừng đến em!`,
                type: NotificationType.ENROLLMENT,
                link,
              });
              existingKeySet.add(`${title}|${link}`);
            }
          }
        }
      }

      // 4. Check Tasks Overdue or Due Today
      const todayStr = todayStart.toISOString().split('T')[0];
      const pendingTasks = await this.prisma.teacherTask.findMany({
        where: {
          teacherId,
          done: false,
          dueDate: {
            lte: todayStr,
          },
        },
      });

      for (const task of pendingTasks) {
        const title = `Nhiệm vụ cần hoàn thành: ${task.title}`;
        const link = `/tasks?taskId=${task.id}`;
        if (!existingKeySet.has(`${title}|${link}`)) {
          notificationsToCreate.push({
            title,
            message: `Nhiệm vụ "${task.title}" có hạn chót hôm nay (${task.dueDate || ''}).`,
            type: NotificationType.TASK,
            link,
          });
          existingKeySet.add(`${title}|${link}`);
        }
      }

      // 5. Check Worksheet Assignments Due Today
      const activeAssignments = await this.prisma.worksheetAssignment.findMany({
        where: {
          teacherId,
          dueAt: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
        include: {
          worksheet: { select: { id: true, title: true } },
          classroom: { select: { name: true } },
        },
      });

      for (const assign of activeAssignments) {
        if (assign.worksheet) {
          const title = `Hạn nộp phiếu học tập "${assign.worksheet.title}" (${assign.classroom?.name || ''})`;
          const link = `/worksheets?worksheetId=${assign.worksheet.id}`;
          if (!existingKeySet.has(`${title}|${link}`)) {
            notificationsToCreate.push({
              title,
              message: `Hôm nay là hạn nộp bài phiếu học tập "${assign.worksheet.title}" của lớp ${assign.classroom?.name || ''}.`,
              type: NotificationType.ASSESSMENT,
              link,
            });
            existingKeySet.add(`${title}|${link}`);
          }
        }
      }

      // Insert all generated notifications
      if (notificationsToCreate.length > 0) {
        await this.prisma.notification.createMany({
          data: notificationsToCreate.map((n) => ({
            userId,
            title: n.title,
            message: n.message,
            type: n.type,
            link: n.link,
            isRead: false,
          })),
        });
      }
    } catch (err: any) {
      this.logger.warn(`Error generating teacher reminders: ${err?.message}`);
    }
  }

  /**
   * Get user's notifications with pagination & filters
   */
  async getUserNotifications(userId: string, teacherId: string | undefined, query: NotificationQueryDto) {
    // Generate latest smart reminders idempotently
    await this.generateTeacherReminders(userId, teacherId);

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

    const formattedItems = items.map((item) => this.formatNotification(item));
    const paginated = new PaginatedResultDto(formattedItems, total, page, pageSize);

    return {
      ...paginated,
      unreadCount,
    };
  }

  /**
   * Get total unread count for badge
   */
  async getUnreadCount(userId: string, teacherId?: string): Promise<{ count: number }> {
    await this.generateTeacherReminders(userId, teacherId);
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
      return this.formatNotification(notification);
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return this.formatNotification(updated);
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
