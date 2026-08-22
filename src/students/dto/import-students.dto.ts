import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export class ImportStudentRowDto {
  @ApiProperty({ example: 'Nguyễn Văn An' })
  @IsString({ message: 'Họ và tên không được để trống' })
  @IsNotEmpty({ message: 'Họ và tên không được để trống' })
  fullName: string;

  @ApiPropertyOptional({ example: 'HS001' })
  @IsOptional()
  @IsString()
  studentCode?: string;

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

  @ApiPropertyOptional({ example: 'Chủ động phát biểu' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class ImportStudentsDto {
  @ApiProperty({ example: 'class-uuid' })
  @IsString({ message: 'Mã lớp học không được để trống' })
  @IsNotEmpty({ message: 'Mã lớp học không được để trống' })
  classroomId: string;

  @ApiProperty({ type: [ImportStudentRowDto] })
  @IsArray({ message: 'Danh sách học sinh phải là một mảng' })
  @ValidateNested({ each: true })
  @Type(() => ImportStudentRowDto)
  students: ImportStudentRowDto[];
}
