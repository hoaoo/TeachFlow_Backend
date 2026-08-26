import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DevicePlatform } from '@prisma/client';

export class RegisterDeviceDto {
  @ApiProperty({
    description: 'Expo Push Token nhận từ Notifications.getExpoPushTokenAsync()',
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  })
  @IsString()
  @IsNotEmpty()
  expoPushToken: string;

  @ApiPropertyOptional({
    enum: DevicePlatform,
    default: DevicePlatform.ANDROID,
    description: 'Nền tảng thiết bị (ANDROID | IOS | WEB)',
  })
  @IsOptional()
  @IsEnum(DevicePlatform)
  platform?: DevicePlatform = DevicePlatform.ANDROID;

  @ApiPropertyOptional({
    description: 'Mã định danh thiết bị (Device ID)',
    example: 'd9b3a5b2-3e2b-4d44-a95e-5b4372e90e72',
  })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({
    description: 'Tên model thiết bị (ví dụ: Pixel 7, iPhone 15)',
    example: 'Pixel 7',
  })
  @IsOptional()
  @IsString()
  deviceModel?: string;

  @ApiPropertyOptional({
    description: 'Phiên bản ứng dụng (ví dụ: 1.0.0)',
    example: '1.0.0',
  })
  @IsOptional()
  @IsString()
  appVersion?: string;
}
