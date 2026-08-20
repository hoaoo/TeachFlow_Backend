import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class GenerateStudentCommentDto {
  @ApiPropertyOptional({ example: 'c1234567-89ab-cdef-0123-456789abcdef', description: 'ID học sinh (tùy chọn)' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ example: 'Tiếng Việt', description: 'Tên môn học' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({
    example: { 'Đọc': 'Tốt', 'Viết': 'Cần hỗ trợ', 'Giao tiếp': 'Tích cực' },
    description: 'Bảng tiêu chí đánh giá ẩn danh',
  })
  @IsOptional()
  @IsObject()
  criteria?: Record<string, string>;

  @ApiPropertyOptional({ example: 'Hoàn thành tốt', description: 'Mức độ đánh giá chung' })
  @IsOptional()
  @IsString()
  assessmentLevel?: string;

  @ApiPropertyOptional({ example: 'Chủ động phát biểu, tiếp thu bài nhanh nhưng cần cẩn thận hơn khi trình bày', description: 'Ghi chú quan sát của giáo viên' })
  @IsOptional()
  @IsString()
  notes?: string;
}
