import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UploadLessonPlanDto {
  @ApiPropertyOptional({ description: 'Tiêu đề giáo án (mặc định lấy từ tên file nếu không nhập)' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Toán' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ example: 'Lớp 4A' })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiPropertyOptional({ description: 'ID lớp học' })
  @IsOptional()
  @IsString()
  classroomId?: string;

  @ApiPropertyOptional({ description: 'ID môn học' })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ example: '2026-08-25' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ example: 'Chủ đề: Phân số' })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiPropertyOptional({ example: 'Ghi chú giáo án...' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'ID lịch dạy cần gắn' })
  @IsOptional()
  @IsString()
  scheduleId?: string;
}
