import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsBoolean } from 'class-validator';

export class CloneClassroomDto {
  @ApiProperty({ description: 'ID Năm học mới sẽ chuyển sang', example: 'e9e50c01-6ebd-43cf-a128-abca025b0bff' })
  @IsString({ message: 'Mã năm học mới phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Năm học đích không được để trống' })
  targetSchoolYearId: string;

  @ApiProperty({ description: 'Tên lớp học mới, ví dụ: Lớp 5A1', example: 'Lớp 5A1' })
  @IsString({ message: 'Tên lớp mới phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên lớp mới không được để trống' })
  targetName: string;

  @ApiPropertyOptional({ description: 'Mã lớp mới (duy nhất theo năm học), ví dụ: 5A1', example: '5A1' })
  @IsOptional()
  @IsString({ message: 'Mã lớp phải là chuỗi ký tự' })
  targetCode?: string;

  @ApiPropertyOptional({ description: 'ID Khối lớp mới (nếu chuyển khối)', example: '14cf8399-d149-46a6-b44c-f9b4cbbbae1e' })
  @IsOptional()
  @IsString()
  targetGradeId?: string;

  @ApiPropertyOptional({ description: 'Có sao chép danh sách học sinh sang năm học mới không', default: false })
  @IsOptional()
  @IsBoolean()
  copyStudents?: boolean;
}
