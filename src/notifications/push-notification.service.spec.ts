import { Test, TestingModule } from '@nestjs/testing';
import { PushNotificationService } from './push-notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { DevicePlatform, NotificationType } from '@prisma/client';

describe('PushNotificationService', () => {
  let service: PushNotificationService;
  let prisma: PrismaService;

  const mockPrismaService = {
    pushDevice: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<PushNotificationService>(PushNotificationService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerDevice()', () => {
    it('should upsert device token idempotently', async () => {
      mockPrismaService.pushDevice.upsert.mockResolvedValue({
        id: 'device-1',
        userId: 'user-1',
        expoPushToken: 'ExponentPushToken[test-token-123456]',
        platform: DevicePlatform.ANDROID,
        enabled: true,
      });

      const res = await service.registerDevice('user-1', {
        expoPushToken: 'ExponentPushToken[test-token-123456]',
        platform: DevicePlatform.ANDROID,
        deviceModel: 'Pixel 7',
        appVersion: '1.0.0',
      });

      expect(res.success).toBe(true);
      expect(mockPrismaService.pushDevice.upsert).toHaveBeenCalledWith({
        where: { expoPushToken: 'ExponentPushToken[test-token-123456]' },
        update: expect.objectContaining({
          userId: 'user-1',
          platform: DevicePlatform.ANDROID,
          enabled: true,
        }),
        create: expect.objectContaining({
          userId: 'user-1',
          expoPushToken: 'ExponentPushToken[test-token-123456]',
          platform: DevicePlatform.ANDROID,
          enabled: true,
        }),
      });
    });

    it('should reassign existing device token to new user on account switch', async () => {
      mockPrismaService.pushDevice.upsert.mockResolvedValue({
        id: 'device-1',
        userId: 'user-2',
        expoPushToken: 'ExponentPushToken[shared-phone-token]',
        platform: DevicePlatform.ANDROID,
        enabled: true,
      });

      const res = await service.registerDevice('user-2', {
        expoPushToken: 'ExponentPushToken[shared-phone-token]',
      });

      expect(res.success).toBe(true);
      expect(mockPrismaService.pushDevice.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { expoPushToken: 'ExponentPushToken[shared-phone-token]' },
          update: expect.objectContaining({
            userId: 'user-2',
            enabled: true,
          }),
        }),
      );
    });
  });

  describe('unregisterDevice()', () => {
    it('should disable device token for specified user on logout', async () => {
      mockPrismaService.pushDevice.updateMany.mockResolvedValue({ count: 1 });

      const res = await service.unregisterDevice('user-1', {
        expoPushToken: 'ExponentPushToken[test-token-123456]',
      });

      expect(res.success).toBe(true);
      expect(mockPrismaService.pushDevice.updateMany).toHaveBeenCalledWith({
        where: {
          expoPushToken: 'ExponentPushToken[test-token-123456]',
          userId: 'user-1',
        },
        data: expect.objectContaining({
          enabled: false,
        }),
      });
    });
  });

  describe('sendPushToUser()', () => {
    it('should not dispatch if user has no active devices registered', async () => {
      mockPrismaService.pushDevice.findMany.mockResolvedValue([]);
      const fetchSpy = jest.spyOn(global, 'fetch');

      await service.sendPushToUser('user-without-devices', {
        id: 'notif-1',
        userId: 'user-without-devices',
        title: 'Tiêu đề',
        message: 'Nội dung',
        body: 'Nội dung',
        type: NotificationType.SYSTEM,
        targetType: 'SYSTEM',
        targetId: null,
        metadata: {},
        link: null,
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      });

      expect(mockPrismaService.pushDevice.findMany).toHaveBeenCalledWith({
        where: {
          userId: { in: ['user-without-devices'] },
          enabled: true,
        },
        select: expect.any(Object),
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should build payload with deep-link metadata and dispatch to Expo', async () => {
      mockPrismaService.pushDevice.findMany.mockResolvedValue([
        {
          id: 'dev-1',
          expoPushToken: 'ExponentPushToken[valid-token-123456]',
          userId: 'user-1',
        },
      ]);

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ status: 'ok', id: 'ticket-1' }],
        }),
      });
      global.fetch = mockFetch;

      await service.sendPushToUser('user-1', {
        id: 'notif-123',
        userId: 'user-1',
        title: 'Sắp đến giờ dạy',
        message: 'Bạn có tiết Toán lúc 08:00',
        body: 'Bạn có tiết Toán lúc 08:00',
        type: NotificationType.ASSIGNMENT,
        targetType: 'SCHEDULE',
        targetId: 'sched-456',
        metadata: { scheduleId: 'sched-456' },
        link: '/schedule?scheduleId=sched-456',
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/send',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Sắp đến giờ dạy'),
        }),
      );
    });

    it('should deactivate token if Expo returns DeviceNotRegistered error', async () => {
      mockPrismaService.pushDevice.findMany.mockResolvedValue([
        {
          id: 'dev-1',
          expoPushToken: 'ExponentPushToken[expired-token-123456]',
          userId: 'user-1',
        },
      ]);

      mockPrismaService.pushDevice.updateMany.mockResolvedValue({ count: 1 });

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              status: 'error',
              message: 'DeviceNotRegistered',
              details: { error: 'DeviceNotRegistered' },
            },
          ],
        }),
      });
      global.fetch = mockFetch;

      await service.sendPushToUser('user-1', {
        id: 'notif-123',
        userId: 'user-1',
        title: 'Test',
        message: 'Test msg',
        body: 'Test msg',
        type: NotificationType.SYSTEM,
        targetType: 'SYSTEM',
        targetId: null,
        metadata: {},
        link: null,
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      });

      expect(mockPrismaService.pushDevice.updateMany).toHaveBeenCalledWith({
        where: { expoPushToken: 'ExponentPushToken[expired-token-123456]' },
        data: { enabled: false },
      });
    });
  });
});
