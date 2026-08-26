import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class PresignUploadDto {
  @ApiProperty({ example: 'bai_giang_toan_4.pptx', description: 'Tên tập tin gốc bao gồm phần mở rộng' })
  @IsString()
  @IsNotEmpty({ message: 'Tên tập tin không được để trống' })
  fileName: string;

  @ApiProperty({ example: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', description: 'MIME Type của tập tin' })
  @IsString()
  @IsNotEmpty({ message: 'MIME type không được để trống' })
  contentType: string;

  @ApiPropertyOptional({ example: 1048576, description: 'Dung lượng tập tin theo bytes' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  fileSize?: number;

  @ApiPropertyOptional({ example: 'resources', description: 'Thư mục lưu trữ (resources, lesson-plans, worksheets)' })
  @IsOptional()
  @IsString()
  folder?: string;
}

export class PresignedUploadResponseDto {
  @ApiProperty({ example: 'https://storage.teachflow.vn/resources/uuid.pptx?signed=...', description: 'URL tải lên trực tiếp (PUT/POST)' })
  uploadUrl: string;

  @ApiProperty({ example: 'PUT', enum: ['PUT', 'POST'], description: 'Phương thức HTTP dùng khi upload' })
  method: 'PUT' | 'POST';

  @ApiProperty({ example: 'resources/123e4567-e89b-12d3-a456-426614174000.pptx', description: 'Mã định danh khóa tệp (fileKey) dùng cho bước complete-upload' })
  fileKey: string;

  @ApiProperty({ example: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }, description: 'Headers cần gửi kèm khi upload' })
  headers: Record<string, string>;

  @ApiProperty({ example: 3600, description: 'Thời gian hiệu lực của upload URL (giây)' })
  expiresIn: number;
}

export class CompleteUploadDto {
  @ApiProperty({ example: 'resources/123e4567-e89b-12d3-a456-426614174000.pptx', description: 'Khóa tệp đã upload thành công từ bước presign' })
  @IsString()
  @IsNotEmpty({ message: 'fileKey không được để trống' })
  fileKey: string;

  @ApiProperty({ example: 'Bài giảng Toán 4 - Phân số', description: 'Tên hiển thị của học liệu' })
  @IsString()
  @IsNotEmpty({ message: 'Tên học liệu không được để trống' })
  name: string;

  @ApiPropertyOptional({ example: 'subject-uuid', description: 'Mã môn học liên kết' })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ example: 'grade-uuid', description: 'Mã khối lớp liên kết' })
  @IsOptional()
  @IsString()
  gradeId?: string;

  @ApiPropertyOptional({ example: 'lesson-uuid', description: 'Mã kế hoạch bài dạy liên kết' })
  @IsOptional()
  @IsString()
  lessonId?: string;

  @ApiPropertyOptional({ example: 'Bài giảng trình chiếu powerpoint minh họa trực quan', description: 'Mô tả học liệu' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'teal', description: 'Màu thẻ card giao diện' })
  @IsOptional()
  @IsString()
  tone?: string;

  @ApiPropertyOptional({ example: 2048576, description: 'Dung lượng thực tế tính theo bytes' })
  @IsOptional()
  @IsNumber()
  size?: number;

  @ApiPropertyOptional({ example: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', description: 'MIME type' })
  @IsOptional()
  @IsString()
  mimeType?: string;
}

export class ResourceSignedUrlDto {
  @ApiProperty({ example: 'https://api.teachflow.vn/api/resources/stream/uuid.pptx?token=...', description: 'URL tạm thời có chữ ký để truy cập tài nguyên' })
  url: string;

  @ApiProperty({ example: '2026-08-26T03:20:00.000Z', description: 'Thời điểm hết hạn của URL (UTC ISO 8601)' })
  expiresAt: string;

  @ApiProperty({ example: 'bai_giang_toan_4.pptx', description: 'Tên tập tin gốc' })
  fileName: string;

  @ApiProperty({ example: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', description: 'MIME Type' })
  mimeType: string;

  @ApiProperty({ example: 2048576, description: 'Kích thước tệp (bytes)' })
  size: number;
}
