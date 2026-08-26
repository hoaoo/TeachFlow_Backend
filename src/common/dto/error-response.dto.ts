import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 400, description: 'HTTP Status Code' })
  statusCode: number;

  @ApiProperty({ example: 'Dữ liệu không hợp lệ', description: 'Thông báo lỗi hoặc mảng lỗi' })
  message: string | string[];

  @ApiProperty({ example: 'Bad Request', description: 'Tên lỗi HTTP chuẩn' })
  error: string;

  @ApiPropertyOptional({ example: 'INVALID_INPUT', description: 'Mã lỗi đặc thù của hệ thống' })
  code?: string;

  @ApiProperty({ example: '2026-08-26T02:20:00.000Z', description: 'Thời điểm xảy ra lỗi (UTC ISO 8601)' })
  timestamp: string;

  @ApiProperty({ example: '/api/auth/login', description: 'Đường dẫn endpoint xảy ra lỗi' })
  path: string;
}
