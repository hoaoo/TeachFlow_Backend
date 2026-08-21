import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export class CreateCriterionDto {
  @ApiProperty({ example: 'READING' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Đọc hiểu' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class CreateAssessmentDto {
  @ApiProperty({ example: 'Đánh giá giữa kỳ I' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: 'Toán · Lớp 4A' })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional({ example: 'Đang thực hiện' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: '28/32 học sinh' })
  @IsOptional()
  @IsString()
  meta?: string;

  @ApiPropertyOptional({ example: 'teal' })
  @IsOptional()
  @IsString()
  tone?: 'teal' | 'blue' | 'orange' | 'violet';

  @ApiPropertyOptional({ description: 'ID phân công giảng dạy (Nguồn chuẩn)' })
  @IsOptional()
  @IsString()
  teachingAssignmentId?: string;

  @ApiPropertyOptional({ description: 'ID lớp học (legacy compatibility)' })
  @IsOptional()
  @IsString()
  classroomId?: string;

  @ApiPropertyOptional({ description: 'ID môn học (legacy compatibility)' })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'ID năm học (legacy compatibility)' })
  @IsOptional()
  @IsString()
  schoolYearId?: string;

  @ApiPropertyOptional({ type: [CreateCriterionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCriterionDto)
  criteria?: CreateCriterionDto[];
}
