import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested, IsIn } from 'class-validator';
import { CreateActivityDto } from './create-activity.dto';

export class CreateLessonPlanDto {
  @ApiProperty({ example: 'Phân số bằng nhau' })
  @IsString()
  @IsNotEmpty({ message: 'Tiêu đề giáo án không được để trống' })
  title: string;

  @ApiPropertyOptional({ example: 'Chủ đề 1: Phân số và các phép tính' })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiPropertyOptional({ example: 'Toán' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ example: 'Lớp 4A' })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiPropertyOptional({ example: '2026-08-21' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({ example: 'Nhận biết được các phân số bằng nhau và vận dụng...' })
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({ example: 'Năng lực tư duy và lập luận toán học...' })
  @IsOptional()
  @IsString()
  specificCompetencies?: string;

  @ApiPropertyOptional({ example: 'Tự chủ và tự học, giao tiếp và hợp tác...' })
  @IsOptional()
  @IsString()
  generalCompetencies?: string;

  @ApiPropertyOptional({ example: 'Chăm chỉ, trung thực, trách nhiệm...' })
  @IsOptional()
  @IsString()
  qualities?: string;

  @ApiPropertyOptional({ example: 'Bộ đồ dùng học toán 4, phiếu học tập, máy chiếu...' })
  @IsOptional()
  @IsString()
  teachingEquipment?: string;

  @ApiPropertyOptional({ example: 'Học sinh hiểu bài tốt, cần củng cố thêm bài 3...' })
  @IsOptional()
  @IsString()
  postLessonAdjustment?: string;

  @ApiPropertyOptional({ example: 'Chuẩn bị thêm 2 bảng phụ cho hoạt động nhóm...' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: ['DRAFT', 'COMPLETED', 'TAUGHT'], default: 'DRAFT' })
  @IsOptional()
  @IsString()
  @IsIn(['DRAFT', 'COMPLETED', 'TAUGHT'], { message: 'Trạng thái phải là DRAFT, COMPLETED hoặc TAUGHT' })
  status?: string;

  @ApiPropertyOptional({ description: 'ID phân công giảng dạy' })
  @IsOptional()
  @IsString()
  teachingAssignmentId?: string;

  @ApiPropertyOptional({ description: 'ID môn học' })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'ID lớp học' })
  @IsOptional()
  @IsString()
  classroomId?: string;

  @ApiPropertyOptional({ description: 'ID bài học' })
  @IsOptional()
  @IsString()
  lessonId?: string;

  @ApiPropertyOptional({ description: 'ID lịch dạy cần liên kết tự động' })
  @IsOptional()
  @IsString()
  scheduleId?: string;

  @ApiPropertyOptional({ type: [CreateActivityDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateActivityDto)
  activities?: CreateActivityDto[];
}
