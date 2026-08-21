import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    teacher: {
      findUnique: jest.fn(),
    },
    notification: {
      create: jest.fn(),
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
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createNotification()', () => {
    it('should create notification using direct userId', async () => {
      mockPrismaService.notification.create.mockResolvedValue({
        id: 'notif-1',
        userId: 'user-1',
        title: 'Thông báo',
        message: 'Nội dung',
        type: NotificationType.SYSTEM,
      });

      const res = await service.createNotification({
        userId: 'user-1',
        title: 'Thông báo',
        message: 'Nội dung',
      });

      expect(mockPrismaService.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          title: 'Thông báo',
          message: 'Nội dung',
          type: NotificationType.SYSTEM,
          link: null,
        },
      });
      expect(res?.id).toBe('notif-1');
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

  describe('getUserNotifications() & unread counts', () => {
    it('should return paginated list and unread count', async () => {
      mockPrismaService.notification.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(3); // unread
      mockPrismaService.notification.findMany.mockResolvedValue([
        { id: 'n1', title: 'Thông báo 1', isRead: false },
      ]);

      const res = await service.getUserNotifications('user-1', { page: 1, pageSize: 20 });

      expect(res.items).toHaveLength(1);
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
        isRead: true,
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
