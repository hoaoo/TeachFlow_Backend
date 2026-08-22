import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class ImportScoreRowDto {
  @ApiPropertyOptional({ description: 'Mã học sinh', example: 'HS0001' })
  @IsOptional()
  @IsString()
  studentCode?: string;

  @ApiPropertyOptional({ description: 'ID học sinh' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Họ và tên học sinh (dùng để tham chiếu hiển thị preview)', example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ description: 'Điểm số từ 0 đến 10', example: 8.5 })
  @IsOptional()
  @IsNumber({}, { message: 'Điểm số phải là giá trị số' })
  @Min(0, { message: 'Điểm số không được nhỏ hơn 0' })
  @Max(10, { message: 'Điểm số không được lớn hơn 10' })
  score?: number | null;

  @ApiPropertyOptional({ description: 'Nhận xét' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class ImportGradebookScoresDto {
  @ApiProperty({ description: 'ID bài đánh giá (cột điểm)' })
  @IsString()
  @IsNotEmpty()
  assessmentId: string;

  @ApiProperty({ description: 'ID lớp học' })
  @IsString()
  @IsNotEmpty()
  classroomId: string;

  @ApiProperty({ type: [ImportScoreRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportScoreRowDto)
  scores: ImportScoreRowDto[];
}
