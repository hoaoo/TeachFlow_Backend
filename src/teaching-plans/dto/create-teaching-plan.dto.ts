import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateTeachingPlanDto {
  @ApiProperty({ example: 'Phân số và phép chia số tự nhiên', description: 'Tên bài / Nội dung tiết dạy' })
  @IsString()
  @IsNotEmpty({ message: 'Tên bài / nội dung tiết dạy không được để trống' })
  title: string;

  @ApiProperty({ example: 'classroom-uuid', description: 'ID lớp học (bắt buộc)' })
  @IsString()
  @IsNotEmpty({ message: 'Lớp học không được để trống' })
  classroomId: string;

  @ApiProperty({ example: 'subject-uuid', description: 'ID môn học (bắt buộc)' })
  @IsString()
  @IsNotEmpty({ message: 'Môn học không được để trống' })
  subjectId: string;

  @ApiPropertyOptional({ example: '2026-08-24', description: 'Ngày dạy (ISO date YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày dạy không hợp lệ (định dạng YYYY-MM-DD)' })
  plannedDate?: string;

  @ApiPropertyOptional({ example: '07:00', description: 'Giờ bắt đầu (HH:MM)' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Giờ bắt đầu phải theo định dạng HH:MM' })
  startTime?: string;

  @ApiPropertyOptional({ example: '07:45', description: 'Giờ kết thúc (HH:MM)' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Giờ kết thúc phải theo định dạng HH:MM' })
  endTime?: string;

  @ApiPropertyOptional({ example: 'Phòng 204', description: 'Phòng học' })
  @IsOptional()
  @IsString()
  room?: string;

  @ApiPropertyOptional({ example: 'Chuẩn bị phiếu bài tập', description: 'Ghi chú' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: '2026-2027-uuid', description: 'ID năm học (tự động lấy theo lớp nếu không cung cấp)' })
  @IsOptional()
  @IsString()
  schoolYearId?: string;

  @ApiPropertyOptional({ example: 'lesson-uuid', description: 'ID bài học từ thư viện (không bắt buộc)' })
  @IsOptional()
  @IsString()
  lessonId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  weekNumber?: number;

  // Legacy fields kept for backward compat with WorkspaceRecord
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional({ example: 'PLANNED' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  meta?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tone?: 'teal' | 'blue' | 'orange' | 'violet';
}
