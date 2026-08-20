import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateActivityDto {
  @ApiProperty({ example: 4, description: 'Khối lớp (1 - 5)' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Khối lớp phải là một số nguyên từ 1 đến 5' })
  @Min(1)
  @Max(5)
  grade: number;

  @ApiProperty({ example: 'Toán', description: 'Tên môn học' })
  @IsString()
  @IsNotEmpty({ message: 'Tên môn học không được để trống' })
  subject: string;

  @ApiProperty({ example: 'Phân số bằng nhau', description: 'Tên bài học' })
  @IsString()
  @IsNotEmpty({ message: 'Tên bài học không được để trống' })
  lessonTitle: string;

  @ApiProperty({ example: 'WARM_UP', description: 'Loại hoạt động (WARM_UP, EXPLORE, PRACTICE, APPLICATION, OTHER)' })
  @IsString()
  @IsNotEmpty({ message: 'Loại hoạt động không được để trống' })
  activityType: string;

  @ApiPropertyOptional({ example: 5, description: 'Thời lượng hoạt động (phút)', default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2)
  @Max(45)
  durationMinutes?: number = 5;

  @ApiPropertyOptional({ example: 'Thiết kế trò chơi khởi động 5 phút, phát triển năng lực giao tiếp', description: 'Yêu cầu cụ thể của giáo viên' })
  @IsOptional()
  @IsString()
  requirement?: string;
}
