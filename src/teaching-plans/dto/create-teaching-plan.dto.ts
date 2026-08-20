import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateTeachingPlanDto {
  @ApiProperty({ example: 'Phân số bằng nhau' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: 'Toán · Lớp 4A' })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional({ example: 'Đã lên lịch' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: '07:30 · Phòng 204' })
  @IsOptional()
  @IsString()
  meta?: string;

  @ApiPropertyOptional({ example: 'teal' })
  @IsOptional()
  @IsString()
  tone?: 'teal' | 'blue' | 'orange' | 'violet';

  @ApiPropertyOptional({ example: 'Phòng 204' })
  @IsOptional()
  @IsString()
  room?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  weekNumber?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classroomId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  schoolYearId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lessonId?: string;
}
