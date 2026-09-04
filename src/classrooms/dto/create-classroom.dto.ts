import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, IsBoolean, IsUUID } from 'class-validator';

export class CreateClassroomDto {
  @ApiProperty({ description: 'Tên lớp học, ví dụ: Lớp 4A1', example: 'Lớp 4A1' })
  @IsString({ message: 'Tên lớp phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên lớp không được để trống' })
  name: string;

  @ApiPropertyOptional({ description: 'Mã lớp (duy nhất theo năm học), ví dụ: 4A1', example: '4A1' })
  @IsOptional()
  @IsString({ message: 'Mã lớp phải là chuỗi ký tự' })
  code?: string;

  @ApiPropertyOptional({ description: 'ID Khối lớp', example: '14cf8399-d149-46a6-b44c-f9b4cbbbae1e' })
  @IsOptional()
  @IsString({ message: 'Mã khối lớp (gradeId) phải là chuỗi ký tự' })
  gradeId?: string;

  @ApiProperty({ description: 'ID Năm học', example: 'e9e50c01-6ebd-43cf-a128-abca025b0bff' })
  @IsString({ message: 'Mã năm học (schoolYearId) phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Năm học không được để trống' })
  schoolYearId: string;

  @ApiPropertyOptional({ description: 'ID Giáo viên chủ nhiệm' })
  @IsOptional()
  @IsString()
  homeroomTeacherId?: string;

  @ApiPropertyOptional({
    description: 'Đánh dấu lớp chủ nhiệm của giáo viên hiện tại (lấy từ JWT, không tin teacherId từ client)',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isHomeroom?: boolean;

  @ApiPropertyOptional({ description: 'ID Giáo viên (tương thích backward)' })
  @IsOptional()
  @IsString()
  teacherId?: string;

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

  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Danh sách môn học được cấu hình cho lớp' })
  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true, message: 'Danh sách môn học chứa ID không hợp lệ' })
  subjectIds?: string[];
}
