import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class StudentImportItemDto {
  @ApiProperty({ example: 'Nguyễn Văn An' })
  @IsString()
  @IsNotEmpty({ message: 'Họ và tên học sinh không được để trống' })
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

  @ApiPropertyOptional({ example: 'Ghi chú ban đầu' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class ImportStudentsDto {
  @ApiProperty({ type: [StudentImportItemDto], description: 'Danh sách học sinh cần import' })
  @IsArray({ message: 'Danh sách học sinh phải là một mảng' })
  @ValidateNested({ each: true })
  @Type(() => StudentImportItemDto)
  students: StudentImportItemDto[];
}
