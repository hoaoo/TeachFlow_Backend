import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CreateAssessmentDto } from './create-assessment.dto';

export class UpdateAssessmentDto extends PartialType(CreateAssessmentDto) {
  @ApiPropertyOptional({ description: 'Version cho optimistic concurrency' })
  @IsOptional()
  @IsInt()
  version?: number;
}

export enum AssessmentLevelEnum {
  EXCELLENT = 'EXCELLENT',
  COMPLETED = 'COMPLETED',
  NEEDS_SUPPORT = 'NEEDS_SUPPORT',
}

export class StudentAssessmentItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  criterionId?: string;

  @ApiPropertyOptional({ enum: AssessmentLevelEnum, default: AssessmentLevelEnum.COMPLETED })
  @IsOptional()
  @IsEnum(AssessmentLevelEnum)
  level?: AssessmentLevelEnum = AssessmentLevelEnum.COMPLETED;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  score?: number;

  @ApiPropertyOptional()
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
