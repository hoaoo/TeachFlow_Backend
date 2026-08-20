import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateClassroomDto {
  @ApiProperty({ example: 'Lớp 4A' })
  @IsString({ message: 'Tên lớp phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên lớp không được để trống' })
  name: string;

  @ApiPropertyOptional({ example: 'Khối 4' })
  @IsOptional()
  @IsString()
  gradeName?: string;

  @ApiPropertyOptional({ description: 'ID Khối lớp' })
  @IsOptional()
  @IsString()
  gradeId?: string;

  @ApiPropertyOptional({ description: 'ID Năm học' })
  @IsOptional()
  @IsString()
  schoolYearId?: string;

  @ApiPropertyOptional({ example: 'Phòng 204' })
  @IsOptional()
  @IsString()
  room?: string;

  @ApiPropertyOptional({ example: 'Sáng · Thứ 2 - Thứ 6' })
  @IsOptional()
  @IsString()
  schedule?: string;

  @ApiPropertyOptional({ example: 'teal' })
  @IsOptional()
  @IsString()
  accent?: string;
}
