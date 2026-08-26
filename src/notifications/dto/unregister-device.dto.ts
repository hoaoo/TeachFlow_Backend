import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UnregisterDeviceDto {
  @ApiProperty({
    description: 'Expo Push Token cần hủy đăng ký',
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  })
  @IsString()
  @IsNotEmpty()
  expoPushToken: string;
}
