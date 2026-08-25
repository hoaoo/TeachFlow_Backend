import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateWorksheetDto {
  @ApiProperty({ example: 4, description: 'Khối lớp (1 - 5)' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  grade: number;

  @ApiProperty({ example: 'Toán', description: 'Tên môn học' })
  @IsString()
  @IsNotEmpty({ message: 'Tên môn học không được để trống' })
  @MaxLength(100)
  subject: string;

  @ApiProperty({ example: 'Phân số bằng nhau', description: 'Tên bài học hoặc chủ đề' })
  @IsString()
  @IsNotEmpty({ message: 'Tên bài học không được để trống' })
  @MaxLength(200)
  lesson: string;

  @ApiPropertyOptional({ example: 6, description: 'Số lượng câu hỏi', default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  numberOfQuestions?: number = 5;

  @ApiPropertyOptional({ example: 'Trung bình', description: 'Độ khó (Dễ, Trung bình, Khó, Phân hóa)' })
  @IsOptional()
  @IsString()
  difficulty?: string;

  @ApiPropertyOptional({
    example: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK'],
    description: 'Các dạng câu hỏi (MULTIPLE_CHOICE, TRUE_FALSE, FILL_BLANK, MATCHING, ESSAY)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  questionTypes?: string[];

  @ApiPropertyOptional({ example: 'Phân số bằng nhau có cùng giá trị', description: 'Nội dung kiến thức trọng tâm' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  knowledgeContent?: string;

  @ApiPropertyOptional({ example: true, description: 'Có kèm đáp án cho giáo viên' })
  @IsOptional()
  @IsBoolean()
  includeAnswers?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Gợi ý chỗ chèn hình minh họa' })
  @IsOptional()
  @IsBoolean()
  includeIllustrations?: boolean;

  @ApiPropertyOptional({ description: 'Yêu cầu bổ sung' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  additionalRequirements?: string;
}
