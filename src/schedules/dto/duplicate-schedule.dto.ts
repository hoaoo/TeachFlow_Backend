import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class DuplicateScheduleDto {
  @ApiPropertyOptional({ description: 'Ngày dạy mới (YYYY-MM-DD)', example: '2026-08-26' })
  @IsString()
  @IsOptional()
  plannedDate?: string;

  @ApiPropertyOptional({ description: 'Giờ bắt đầu (HH:mm)', example: '08:00' })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Giờ bắt đầu phải có định dạng HH:mm' })
  startTime?: string;

  @ApiPropertyOptional({ description: 'Giờ kết thúc (HH:mm)', example: '08:45' })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Giờ kết thúc phải có định dạng HH:mm' })
  endTime?: string;

  @ApiPropertyOptional({ description: 'ID lớp học (nếu đổi lớp)', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsUUID(4)
  @IsOptional()
  classroomId?: string;

  @ApiPropertyOptional({ description: 'ID môn học (nếu đổi môn)', example: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e' })
  @IsUUID(4)
  @IsOptional()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Tiêu đề tiết học mới' })
  @IsString()
  @IsOptional()
  title?: string;
}
