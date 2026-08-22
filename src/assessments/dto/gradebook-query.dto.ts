import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GradebookQueryDto {
  @ApiProperty({ description: 'ID lớp học' })
  @IsString()
  @IsNotEmpty()
  classroomId: string;

  @ApiPropertyOptional({ description: 'ID môn học (nếu lọc theo môn)' })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Học kỳ: 1 (HK1), 2 (HK2)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  semester?: number;

  @ApiPropertyOptional({ description: 'ID năm học' })
  @IsOptional()
  @IsString()
  schoolYearId?: string;
}
