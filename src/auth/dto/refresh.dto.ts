import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({ description: 'Refresh token (nếu không dùng cookie)' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
