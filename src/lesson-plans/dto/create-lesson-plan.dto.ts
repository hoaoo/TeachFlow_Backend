import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { CreateActivityDto } from './create-activity.dto';

export class CreateLessonPlanDto {
  @ApiProperty({ example: 'Phân số bằng nhau' })
  @IsString()
  @IsNotEmpty({ message: 'Tiêu đề giáo án không được để trống' })
  title: string;

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

  @ApiPropertyOptional({ description: 'ID phân công giảng dạy (Nguồn chuẩn cho Teacher, Classroom, Subject, SchoolYear)' })
  @IsOptional()
  @IsString()
  teachingAssignmentId?: string;

  @ApiPropertyOptional({ description: 'ID môn học (legacy compatibility)' })
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

  @ApiPropertyOptional({ type: [CreateActivityDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateActivityDto)
  activities?: CreateActivityDto[];
}
