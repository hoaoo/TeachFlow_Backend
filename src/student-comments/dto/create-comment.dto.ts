import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'Em có tiến bộ rõ rệt trong tuần này.' })
  @IsString()
  @IsNotEmpty({ message: 'Nội dung nhận xét không được để trống' })
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classroomId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjectId?: string;
}

export class UpdateCommentDto {
  @ApiProperty({ example: 'Em tích cực hợp tác cùng các bạn.' })
  @IsString()
  @IsNotEmpty({ message: 'Nội dung nhận xét không được để trống' })
  content: string;
}
