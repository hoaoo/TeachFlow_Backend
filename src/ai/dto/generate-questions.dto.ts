import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateQuestionsDto {
  @ApiProperty({ example: 4, description: 'Khối lớp (1 - 5)' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  grade: number;

  @ApiProperty({ example: 'Tiếng Việt', description: 'Tên môn học' })
  @IsString()
  @IsNotEmpty({ message: 'Tên môn học không được để trống' })
  subject: string;

  @ApiProperty({ example: 'Trong lời mẹ hát', description: 'Chủ đề hoặc tên bài' })
  @IsString()
  @IsNotEmpty({ message: 'Chủ đề bài học không được để trống' })
  topic: string;

  @ApiPropertyOptional({ example: 5, description: 'Số lượng câu hỏi cần sinh', default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  numberOfQuestions?: number = 5;

  @ApiPropertyOptional({
    example: ['Nhận biết', 'Thông hiểu', 'Vận dụng'],
    description: 'Các mức độ nhận thức theo thang Bloom',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  levels?: string[];
}
