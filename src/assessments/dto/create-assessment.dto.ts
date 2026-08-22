import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

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

  @ApiPropertyOptional({ description: 'Học kỳ: 1 (HK1) hoặc 2 (HK2)', example: 1 })
  @IsOptional()
  @IsInt()
  semester?: number;

  @ApiPropertyOptional({ description: 'Loại đánh giá: THUONG_XUYEN, GIUA_KY, CUOI_KY, OTHER', example: 'THUONG_XUYEN' })
  @IsOptional()
  @IsString()
  assessmentType?: string;

  @ApiPropertyOptional({ description: 'Hệ số đánh giá (1, 2, 3)', example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  weight?: number;

  @ApiPropertyOptional({ description: 'Ngày đánh giá ISO string', example: '2026-08-20' })
  @IsOptional()
  @IsString()
  assessmentDate?: string;

  @ApiPropertyOptional({ type: [CreateCriterionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCriterionDto)
  criteria?: CreateCriterionDto[];
}
