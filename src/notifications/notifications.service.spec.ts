import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';

import { PushNotificationService } from './push-notification.service';

describe('NotificationsService (Mobile Deep-link & Reminders)', () => {
  let service: NotificationsService;
  let prisma: PrismaService;
  let pushService: PushNotificationService;

  const mockPushNotificationService = {
    sendPushToUser: jest.fn().mockResolvedValue(undefined),
    sendPushToUsers: jest.fn().mockResolvedValue(undefined),
  };

  const mockPrismaService = {
    teacher: {
      findUnique: jest.fn(),
    },
    classroom: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    schedule: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    student: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    teacherTask: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    worksheetAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PushNotificationService, useValue: mockPushNotificationService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get<PrismaService>(PrismaService);
    pushService = module.get<PushNotificationService>(PushNotificationService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createNotification()', () => {
    it('should create notification using direct userId and format mobile target metadata', async () => {
      mockPrismaService.notification.create.mockResolvedValue({
        id: 'notif-1',
        userId: 'user-1',
        title: 'Thông báo điểm danh',
        message: 'Chưa điểm danh lớp 4A',
        type: NotificationType.HOMEROOM,
        link: '/homeroom?tab=attendance&classroomId=class-123',
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      });

      const res = await service.createNotification({
        userId: 'user-1',
        title: 'Thông báo điểm danh',
        message: 'Chưa điểm danh lớp 4A',
        link: '/homeroom?tab=attendance&classroomId=class-123',
      });

      expect(res?.id).toBe('notif-1');
      expect(res?.targetType).toBe('ATTENDANCE');
      expect(res?.targetId).toBe('class-123');
      expect(res?.metadata.classroomId).toBe('class-123');
      expect(res?.body).toBe('Chưa điểm danh lớp 4A');
    });

    it('should resolve teacherId to userId before creating notification', async () => {
      mockPrismaService.teacher.findUnique.mockResolvedValue({
        userId: 'user-teacher-1',
      });
      mockPrismaService.notification.create.mockResolvedValue({
        id: 'notif-2',
        userId: 'user-teacher-1',
        title: 'Phân công',
        message: 'Nội dung',
        type: NotificationType.ASSIGNMENT,
        link: null,
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      });

      const res = await service.createNotification({
        teacherId: 'teacher-1',
        title: 'Phân công',
        message: 'Nội dung',
        type: NotificationType.ASSIGNMENT,
      });

      expect(mockPrismaService.teacher.findUnique).toHaveBeenCalledWith({
        where: { id: 'teacher-1' },
        select: { userId: true },
      });
      expect(res?.userId).toBe('user-teacher-1');
    });
  });

  describe('getUserNotifications() & deep linking', () => {
    it('should return paginated list with mobile deep-link metadata and unread count', async () => {
      mockPrismaService.notification.findMany
        .mockResolvedValueOnce([]) // existingToday in generateTeacherReminders
        .mockResolvedValueOnce([
          {
            id: 'n1',
            userId: 'user-1',
            title: 'Học sinh mới',
            message: 'Em Nguyễn Văn A vừa chuyển vào lớp',
            type: NotificationType.ENROLLMENT,
            link: '/students/student-abc',
            isRead: false,
            readAt: null,
            createdAt: new Date(),
          },
        ]);
      mockPrismaService.notification.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(3); // unread

      const res = await service.getUserNotifications('user-1', 'teacher-1', { page: 1, pageSize: 20 });

      expect(res.items).toHaveLength(1);
      expect(res.items[0].targetType).toBe('STUDENT');
      expect(res.items[0].targetId).toBe('student-abc');
      expect(res.items[0].metadata.studentId).toBe('student-abc');
      expect(res.totalItems).toBe(10);
      expect(res.unreadCount).toBe(3);
    });
  });

  describe('markAsRead() and IDOR protection', () => {
    it('should throw ForbiddenException if user tries to mark another user notification', async () => {
      mockPrismaService.notification.findUnique.mockResolvedValue({
        id: 'notif-other',
        userId: 'user-other',
        isRead: false,
      });

      await expect(service.markAsRead('notif-other', 'user-attacker')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should update notification to read if authorized', async () => {
      mockPrismaService.notification.findUnique.mockResolvedValue({
        id: 'notif-mine',
        userId: 'user-me',
        isRead: false,
      });
      mockPrismaService.notification.update.mockResolvedValue({
        id: 'notif-mine',
        userId: 'user-me',
        title: 'Thông báo của tôi',
        message: 'Nội dung',
        type: NotificationType.SYSTEM,
        link: null,
        isRead: true,
        readAt: new Date(),
        createdAt: new Date(),
      });

      const res = await service.markAsRead('notif-mine', 'user-me');
      expect(res.isRead).toBe(true);
    });
  });

  describe('markAllAsRead()', () => {
    it('should mark all unread notifications for the user as read', async () => {
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 5 });

      const res = await service.markAllAsRead('user-1');
      expect(res.success).toBe(true);
      expect(res.updatedCount).toBe(5);
    });
  });
});
