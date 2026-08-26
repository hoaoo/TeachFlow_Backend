import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';
import { MobileNotificationPayload, MobileTargetType } from './notifications.service';

export interface ExpoPushMessage {
  to: string;
  sound?: 'default' | null;
  title: string;
  body: string;
  data?: Record<string, any>;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  badge?: number;
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: {
    error?: 'DeviceNotRegistered' | 'MessageTooBig' | 'MessageRateExceeded' | 'InvalidCredentials' | string;
    [key: string]: any;
  };
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly expoPushEndpoint = 'https://exp.host/--/api/v2/push/send';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to mask sensitive push tokens in application logs
   */
  private maskToken(token: string): string {
    if (!token || token.length < 15) return '***';
    return `${token.substring(0, 15)}...${token.slice(-4)}`;
  }

  /**
   * Resolve appropriate Android Notification Channel based on targetType
   */
  private resolveChannelId(targetType: MobileTargetType): string {
    switch (targetType) {
      case 'SCHEDULE':
        return 'schedule';
      case 'TASK':
        return 'tasks';
      case 'ATTENDANCE':
      case 'HOMEROOM':
        return 'attendance';
      case 'SYSTEM':
      default:
        return 'default';
    }
  }

  /**
   * Idempotently registers or updates an Expo Push Token for a user.
   * Handles device reassignment on account switches seamlessly.
   */
  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    try {
      const now = new Date();

      const device = await this.prisma.pushDevice.upsert({
        where: { expoPushToken: dto.expoPushToken },
        update: {
          userId,
          platform: dto.platform,
          deviceId: dto.deviceId || undefined,
          deviceModel: dto.deviceModel || undefined,
          appVersion: dto.appVersion || undefined,
          enabled: true,
          lastSeenAt: now,
        },
        create: {
          userId,
          expoPushToken: dto.expoPushToken,
          platform: dto.platform,
          deviceId: dto.deviceId,
          deviceModel: dto.deviceModel,
          appVersion: dto.appVersion,
          enabled: true,
          lastSeenAt: now,
        },
      });

      this.logger.log(
        `[PUSH_DEVICE_REGISTERED] userId=${userId} token=${this.maskToken(dto.expoPushToken)} platform=${device.platform}`,
      );

      return {
        success: true,
        message: 'Thiết bị đã được đăng ký nhận thông báo',
      };
    } catch (err: any) {
      this.logger.error(`Failed to register push device: ${err?.message}`, err?.stack);
      throw err;
    }
  }

  /**
   * Unregisters / disables a device token for the current user (e.g. on Logout).
   */
  async unregisterDevice(userId: string, dto: UnregisterDeviceDto) {
    try {
      const result = await this.prisma.pushDevice.updateMany({
        where: {
          expoPushToken: dto.expoPushToken,
          userId,
        },
        data: {
          enabled: false,
          lastSeenAt: new Date(),
        },
      });

      this.logger.log(
        `[PUSH_DEVICE_UNREGISTERED] userId=${userId} token=${this.maskToken(dto.expoPushToken)} count=${result.count}`,
      );

      return {
        success: true,
        message: 'Đã hủy đăng ký nhận thông báo trên thiết bị',
      };
    } catch (err: any) {
      this.logger.warn(`Failed to unregister push device: ${err?.message}`);
      return {
        success: false,
        message: 'Không thể hủy đăng ký thiết bị',
      };
    }
  }

  /**
   * Sends push notification to all active devices of a target user.
   */
  async sendPushToUser(userId: string, notification: MobileNotificationPayload): Promise<void> {
    return this.sendPushToUsers([userId], notification);
  }

  /**
   * Sends push notifications in batches to active devices of multiple users.
   * Asynchronous, non-blocking side-effect.
   */
  async sendPushToUsers(userIds: string[], notification: MobileNotificationPayload): Promise<void> {
    if (!userIds || userIds.length === 0) return;

    try {
      const activeDevices = await this.prisma.pushDevice.findMany({
        where: {
          userId: { in: userIds },
          enabled: true,
        },
        select: {
          id: true,
          expoPushToken: true,
          userId: true,
        },
      });

      if (!activeDevices || activeDevices.length === 0) {
        return;
      }

      const messages: ExpoPushMessage[] = activeDevices.map((device) => ({
        to: device.expoPushToken,
        sound: 'default',
        title: notification.title,
        body: notification.message || notification.body,
        data: {
          notificationId: notification.id,
          type: notification.type,
          targetType: notification.targetType,
          targetId: notification.targetId,
          link: notification.link,
          metadata: notification.metadata || {},
        },
        channelId: this.resolveChannelId(notification.targetType),
        priority: 'high',
      }));

      // Send to Expo Push Service in chunks of 100
      const chunkSize = 100;
      for (let i = 0; i < messages.length; i += chunkSize) {
        const chunk = messages.slice(i, i + chunkSize);
        await this.dispatchExpoBatch(chunk);
      }
    } catch (err: any) {
      this.logger.warn(`[PUSH_DISPATCH_FAILED] error=${err?.message}`);
    }
  }

  /**
   * Dispatches a batch of push messages to Expo Push API and handles tickets.
   */
  private async dispatchExpoBatch(messages: ExpoPushMessage[]): Promise<void> {
    try {
      const response = await fetch(this.expoPushEndpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.warn(`Expo push service HTTP ${response.status}: ${errText}`);
        return;
      }

      const result = await response.json();
      const tickets: ExpoPushTicket[] = result.data || [];

      // Check tickets and cleanup invalid tokens
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        const msg = messages[i];

        if (ticket.status === 'error') {
          this.logger.warn(
            `[PUSH_TICKET_ERROR] token=${this.maskToken(msg.to)} error=${ticket.message || ticket.details?.error}`,
          );

          if (ticket.details?.error === 'DeviceNotRegistered') {
            // Token is no longer valid, deactivate in DB
            await this.prisma.pushDevice.updateMany({
              where: { expoPushToken: msg.to },
              data: { enabled: false },
            }).catch(() => {});
            this.logger.log(`[DEVICE_TOKEN_DEACTIVATED] token=${this.maskToken(msg.to)}`);
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to dispatch batch to Expo: ${err?.message}`);
    }
  }
}
