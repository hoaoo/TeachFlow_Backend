import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { AssessmentLevelEnum } from './bulk-student-assessment.dto';

export class QuickAssessmentDto {
  @ApiProperty({ example: ['student-uuid-1', 'student-uuid-2'], description: 'Danh sách ID học sinh được đánh giá' })
  @IsArray({ message: 'Danh sách học sinh phải là một mảng' })
  @IsNotEmpty({ message: 'Danh sách học sinh không được rỗng' })
  studentIds: string[];

  @ApiProperty({ example: 'class-uuid', description: 'ID lớp học' })
  @IsString({ message: 'Mã lớp học không được để trống' })
  @IsNotEmpty({ message: 'Mã lớp học không được để trống' })
  classroomId: string;

  @ApiPropertyOptional({ example: 'subject-uuid', description: 'ID môn học (tùy chọn)' })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiProperty({ example: 'Đánh giá thường xuyên', description: 'Tên bài/tiêu đề đánh giá' })
  @IsString({ message: 'Tiêu đề đánh giá không được để trống' })
  @IsNotEmpty({ message: 'Tiêu đề đánh giá không được để trống' })
  title: string;

  @ApiPropertyOptional({ enum: AssessmentLevelEnum, example: AssessmentLevelEnum.COMPLETED, description: 'Mức độ đánh giá (EXCELLENT, COMPLETED, NEEDS_SUPPORT)' })
  @IsOptional()
  @IsEnum(AssessmentLevelEnum)
  level?: AssessmentLevelEnum;

  @ApiPropertyOptional({ example: 9, description: 'Điểm số từ 0 - 10 (nếu có)' })
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Điểm số tối thiểu là 0' })
  @Max(10, { message: 'Điểm số tối đa là 10' })
  score?: number;

  @ApiPropertyOptional({ example: 'Hoàn thành tốt bài tập', description: 'Nhận xét của giáo viên' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ example: '2026-08-25', description: 'Ngày đánh giá' })
  @IsOptional()
  @IsString()
  assessmentDate?: string;

  @ApiPropertyOptional({ example: 1, description: 'Học kỳ (1 hoặc 2)' })
  @IsOptional()
  @IsNumber()
  semester?: number;
}
