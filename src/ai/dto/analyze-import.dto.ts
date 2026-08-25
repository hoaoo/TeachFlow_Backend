import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class AnalyzeImportDto {
  @ApiProperty({
    example: 'students',
    enum: ['students', 'lesson-plan', 'worksheet'],
    description: 'Loại dữ liệu cần trích xuất',
  })
  @IsString()
  @IsIn(['students', 'lesson-plan', 'worksheet'], {
    message: 'Đích import phải là students, lesson-plan hoặc worksheet',
  })
  target: 'students' | 'lesson-plan' | 'worksheet';

  @ApiPropertyOptional({ description: 'Lớp đích (chỉ dùng để kiểm tra quyền, không ghi DB)' })
  @IsOptional()
  @IsString()
  classroomId?: string;

  @ApiPropertyOptional({ description: 'Gợi ý thêm cho AI khi phân tích tệp' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
