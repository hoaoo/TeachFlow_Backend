import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export const WORKSHEET_QUESTION_TYPES = [
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'FILL_BLANK',
  'MATCHING',
  'ESSAY',
] as const;

export class WorksheetQuestionInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'MULTIPLE_CHOICE', enum: WORKSHEET_QUESTION_TYPES })
  @IsString()
  @IsIn(WORKSHEET_QUESTION_TYPES as unknown as string[], {
    message: 'Dạng câu hỏi không được hỗ trợ',
  })
  questionType: string;

  @ApiProperty({ example: 'Phân số nào bằng 1/2?' })
  @IsString()
  @IsNotEmpty({ message: 'Nội dung câu hỏi không được để trống' })
  content: string;

  @ApiPropertyOptional({ example: ['A. 2/4', 'B. 2/3', 'C. 3/5', 'D. 1/3'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional({ example: 'A. 2/4' })
  @IsOptional()
  correctAnswer?: any;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
