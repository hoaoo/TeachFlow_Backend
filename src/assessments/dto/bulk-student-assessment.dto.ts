import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { AssessmentLevel } from '@prisma/client';
import { CreateAssessmentDto } from './create-assessment.dto';

export { AssessmentLevel, AssessmentLevel as AssessmentLevelEnum };

export class UpdateAssessmentDto extends PartialType(CreateAssessmentDto) {
  @ApiPropertyOptional({ description: 'Version cho optimistic concurrency' })
  @IsOptional()
  @IsInt()
  version?: number;
}

export class StudentAssessmentItemDto {
  @ApiProperty({ description: 'ID học sinh' })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiPropertyOptional({ description: 'ID tiêu chí đánh giá (nếu có)' })
  @IsOptional()
  @IsString()
  criterionId?: string;

  @ApiPropertyOptional({ enum: AssessmentLevel, default: AssessmentLevel.COMPLETED })
  @IsOptional()
  @IsEnum(AssessmentLevel)
  level?: AssessmentLevel = AssessmentLevel.COMPLETED;

  @ApiPropertyOptional({ description: 'Điểm số (0 đến 10), hoặc null để xóa điểm', example: 8.5 })
  @IsOptional()
  @IsNumber({}, { message: 'Điểm số phải là giá trị số' })
  @Min(0, { message: 'Điểm số không được nhỏ hơn 0' })
  @Max(10, { message: 'Điểm số không được lớn hơn 10' })
  score?: number | null;

  @ApiPropertyOptional({ description: 'Nhận xét chi tiết kèm bài kiểm tra' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class BulkStudentAssessmentDto {
  @ApiProperty({ type: [StudentAssessmentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StudentAssessmentItemDto)
  assessments: StudentAssessmentItemDto[];
}

export class BatchSaveAssessmentScoresDto {
  @ApiProperty({ type: [StudentAssessmentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StudentAssessmentItemDto)
  scores: StudentAssessmentItemDto[];
}
