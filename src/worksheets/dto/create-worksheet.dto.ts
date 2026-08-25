import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { WorksheetQuestionInputDto } from './worksheet-question.dto';

export class CreateWorksheetDto {
  @ApiProperty({ example: 'Phiếu luyện tập phân số' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: 'Toán · Lớp 4' })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional({ example: 'Đã xuất bản' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: '12 câu hỏi · 4A' })
  @IsOptional()
  @IsString()
  meta?: string;

  @ApiPropertyOptional({ example: 'teal' })
  @IsOptional()
  @IsString()
  tone?: 'teal' | 'blue' | 'orange' | 'violet';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gradeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classroomId?: string;

  @ApiPropertyOptional({ type: [WorksheetQuestionInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorksheetQuestionInputDto)
  questions?: WorksheetQuestionInputDto[];
}
