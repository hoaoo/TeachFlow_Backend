import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { PushNotificationService } from './push-notification.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách thông báo của người dùng hiện tại' })
  @ApiResponse({ status: 200, description: 'Danh sách thông báo kèm số lượng chưa đọc' })
  async getMyNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationsService.getUserNotifications(user.userId, user.teacherId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Lấy số lượng thông báo chưa đọc (Polling endpoint)' })
  @ApiResponse({ status: 200, description: 'Số lượng thông báo chưa đọc' })
  async getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getUnreadCount(user.userId, user.teacherId);
  }

  @Post('devices')
  @ApiOperation({ summary: 'Đăng ký hoặc cập nhật thiết bị nhận Push Notification' })
  @ApiResponse({ status: 201, description: 'Thiết bị đã được đăng ký thành công' })
  async registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.pushNotificationService.registerDevice(user.userId, dto);
  }

  @Post('devices/unregister')
  @ApiOperation({ summary: 'Hủy đăng ký nhận Push Notification cho thiết bị (khi Logout)' })
  @ApiResponse({ status: 200, description: 'Hủy đăng ký thành công' })
  async unregisterDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UnregisterDeviceDto,
  ) {
    return this.pushNotificationService.unregisterDevice(user.userId, dto);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu một thông báo là đã đọc' })
  @ApiResponse({ status: 200, description: 'Thông báo đã được đánh dấu' })
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationsService.markAsRead(id, user.userId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo của người dùng là đã đọc' })
  @ApiResponse({ status: 200, description: 'Kết quả đánh dấu tất cả' })
  async markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllAsRead(user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa một thông báo' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  async deleteNotification(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationsService.deleteNotification(id, user.userId);
  }
}
