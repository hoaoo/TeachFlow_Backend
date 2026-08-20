import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateLessonPlanDto {
  @ApiProperty({ example: 4, description: 'Khối lớp (1 - 5)' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Khối lớp phải là một số nguyên từ 1 đến 5' })
  @Min(1)
  @Max(5)
  grade: number;

  @ApiProperty({ example: 'Tiếng Việt', description: 'Tên môn học' })
  @IsString({ message: 'Tên môn học phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên môn học không được để trống' })
  subject: string;

  @ApiProperty({ example: 'Trong lời mẹ hát', description: 'Tên bài học' })
  @IsString({ message: 'Tên bài học phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên bài học không được để trống' })
  lessonTitle: string;

  @ApiPropertyOptional({ example: 35, description: 'Thời lượng tiết dạy (phút)', default: 35 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Thời lượng phải là số' })
  @Min(15)
  @Max(90)
  durationMinutes?: number = 35;

  @ApiPropertyOptional({ example: 'Tập trung phát triển năng lực giao tiếp và cảm thụ văn học', description: 'Yêu cầu sư phạm bổ sung' })
  @IsOptional()
  @IsString()
  requirements?: string;
}
