import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
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
  @MaxLength(100)
  subject: string;

  @ApiProperty({ example: 'Trong lời mẹ hát', description: 'Tên bài học' })
  @IsString({ message: 'Tên bài học phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên bài học không được để trống' })
  @MaxLength(200)
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
  @MaxLength(4000)
  requirements?: string;

  @ApiPropertyOptional({ example: 1, description: 'Số tiết' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  numberOfPeriods?: number;

  @ApiPropertyOptional({ example: 'Nhận biết phân số bằng nhau', description: 'Yêu cầu cần đạt do giáo viên nhập' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  objectives?: string;

  @ApiPropertyOptional({ example: 'Chăm chỉ, trung thực', description: 'Phẩm chất' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  qualities?: string;

  @ApiPropertyOptional({ example: 'Tư duy toán học, giao tiếp hợp tác', description: 'Năng lực' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  competencies?: string;

  @ApiPropertyOptional({ description: 'Nội dung giáo viên đã soạn, dùng làm ngữ cảnh' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  teacherContent?: string;

  @ApiPropertyOptional({ description: 'Yêu cầu bổ sung (alias của requirements)' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  additionalRequirements?: string;
}
