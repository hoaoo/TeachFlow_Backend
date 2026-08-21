import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';

export class CreateScheduleDto {
  @ApiProperty({ description: 'ID lớp học (UUID)', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsUUID(4, { message: 'ID lớp học không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng chọn lớp học' })
  classroomId: string;

  @ApiProperty({ description: 'ID môn học (UUID)', example: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e' })
  @IsUUID(4, { message: 'ID môn học không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng chọn môn học' })
  subjectId: string;

  @ApiPropertyOptional({ description: 'ID năm học (UUID)', example: 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f' })
  @IsUUID(4, { message: 'ID năm học không hợp lệ' })
  @IsOptional()
  schoolYearId?: string;

  @ApiProperty({ description: 'Tiêu đề tiết học / Tên bài', example: 'Tiết 1: Ôn tập các phép tính với phân số' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên bài / nội dung tiết học' })
  title: string;

  @ApiPropertyOptional({ description: 'Ngày dạy (YYYY-MM-DD)', example: '2026-08-25' })
  @IsString()
  @IsOptional()
  plannedDate?: string;

  @ApiPropertyOptional({ description: 'Giờ bắt đầu (HH:mm)', example: '07:00' })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Giờ bắt đầu phải có định dạng HH:mm (VD: 07:00)' })
  startTime?: string;

  @ApiPropertyOptional({ description: 'Giờ kết thúc (HH:mm)', example: '07:45' })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Giờ kết thúc phải có định dạng HH:mm (VD: 07:45)' })
  endTime?: string;

  @ApiPropertyOptional({ description: 'Phòng học', example: 'Phòng 204' })
  @IsString()
  @IsOptional()
  room?: string;

  @ApiPropertyOptional({ description: 'Ghi chú', example: 'Mang theo thước kẻ và phiếu học tập' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Trạng thái tiết dạy', example: 'PLANNED', enum: ['PLANNED', 'IN_PROGRESS', 'TAUGHT', 'CANCELLED'] })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Cờ đánh dấu trạng thái được giáo viên cập nhật thủ công', example: false })
  @IsOptional()
  isManualStatus?: boolean;
}
