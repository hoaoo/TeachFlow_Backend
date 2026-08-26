import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TeacherProfileResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'Nguyễn Thị Mai' })
  fullName: string;

  @ApiPropertyOptional({ example: 'https://storage.../avatar.jpg' })
  avatarUrl?: string | null;

  @ApiPropertyOptional({ example: '0901234567' })
  phone?: string | null;

  @ApiPropertyOptional({ example: 'SUBJECT' })
  teachingMode?: string | null;
}

export class UserResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'giaovien@school.edu.vn' })
  email: string;

  @ApiProperty({ example: 'TEACHER', enum: ['ADMIN', 'TEACHER'] })
  role: string;

  @ApiPropertyOptional({ type: TeacherProfileResponseDto })
  teacher?: TeacherProfileResponseDto | null;
}

export class AuthResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', description: 'JWT Access Token' })
  accessToken: string;

  @ApiPropertyOptional({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', description: 'JWT Refresh Token cho mobile lưu trữ an toàn' })
  refreshToken?: string;

  @ApiProperty({ example: 'Bearer', description: 'Loại token' })
  tokenType: string;

  @ApiProperty({ example: '15m', description: 'Thời gian hết hạn của Access Token' })
  expiresIn: string;
}

export class RefreshResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', description: 'JWT Access Token mới' })
  accessToken: string;

  @ApiPropertyOptional({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', description: 'JWT Refresh Token mới sau khi xoay vòng' })
  refreshToken?: string;

  @ApiProperty({ example: 'Bearer', description: 'Loại token' })
  tokenType: string;

  @ApiProperty({ example: '15m', description: 'Thời gian hết hạn của Access Token' })
  expiresIn: string;
}
