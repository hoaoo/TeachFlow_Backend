import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateTeachingPlanDto {
  @ApiProperty({ example: 'Kế hoạch dạy học Chương 2: Phân số', description: 'Tên kế hoạch dạy học / bài học' })
  @IsString()
  @IsNotEmpty({ message: 'Tên kế hoạch không được để trống' })
  title: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'ID lớp học (UUID)' })
  @IsUUID(4, { message: 'ID lớp học không hợp lệ' })
  @IsNotEmpty({ message: 'Lớp học không được để trống' })
  classroomId: string;

  @ApiProperty({ example: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', description: 'ID môn học (UUID)' })
  @IsUUID(4, { message: 'ID môn học không hợp lệ' })
  @IsNotEmpty({ message: 'Môn học không được để trống' })
  subjectId: string;

  @ApiPropertyOptional({ example: 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', description: 'ID năm học (tự động lấy theo lớp nếu không cung cấp)' })
  @IsUUID(4, { message: 'ID năm học không hợp lệ' })
  @IsOptional()
  schoolYearId?: string;

  @ApiPropertyOptional({ example: 'lesson-uuid', description: 'ID bài học từ chương trình chuẩn' })
  @IsOptional()
  @IsString()
  lessonId?: string;

  @ApiPropertyOptional({ example: 1, description: 'Tuần học' })
  @IsOptional()
  @IsInt()
  @Min(1)
  weekNumber?: number;

  @ApiPropertyOptional({ example: 2, description: 'Số tiết quy định' })
  @IsOptional()
  @IsInt()
  @Min(1)
  numberOfPeriods?: number;

  @ApiPropertyOptional({ example: 'Toán học · Lớp 4A1', description: 'Phụ đề / mô tả ngắn' })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional({ example: 'PLANNED', enum: ['PLANNED', 'IN_PROGRESS', 'COMPLETED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Metadata JSON hoặc mục tiêu sư phạm' })
  @IsOptional()
  @IsString()
  meta?: string;

  @ApiPropertyOptional({ example: 'teal' })
  @IsOptional()
  @IsString()
  tone?: 'teal' | 'blue' | 'orange' | 'violet';
}
