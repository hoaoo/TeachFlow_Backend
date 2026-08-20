import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddStudentToClassDto {
  @ApiPropertyOptional({ description: 'ID học sinh nếu đã tồn tại' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiProperty({ example: 'Nguyễn Văn An' })
  @IsString()
  @IsNotEmpty({ message: 'Tên học sinh không được để trống' })
  fullName: string;

  @ApiPropertyOptional({ example: 'Nam' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: '12/04/2016' })
  @IsOptional()
  @IsString()
  dob?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Thị Hoa' })
  @IsOptional()
  @IsString()
  parentName?: string;

  @ApiPropertyOptional({ example: '0901 234 567' })
  @IsOptional()
  @IsString()
  parentPhone?: string;

  @ApiPropertyOptional({ example: 'Chủ động phát biểu, hoàn thành bài đúng hạn.' })
  @IsOptional()
  @IsString()
  note?: string;
}
