import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateStudentDto {
  @ApiProperty({ example: 'Nguyễn Văn An' })
  @IsString({ message: 'Tên học sinh phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên học sinh không được để trống' })
  fullName: string;

  @ApiPropertyOptional({ example: 'NA' })
  @IsOptional()
  @IsString()
  initials?: string;

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

  @ApiPropertyOptional({ example: 'Tốt' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: '4a' })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ example: 'bg-teal-100 text-teal-700' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 'Chủ động phát biểu' })
  @IsOptional()
  @IsString()
  note?: string;
}
