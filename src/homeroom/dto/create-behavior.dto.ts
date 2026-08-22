import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, IsDateString, IsOptional, MaxLength } from 'class-validator';
import { BehaviorCategory, BehaviorLevel } from '@prisma/client';

export class CreateBehaviorRecordDto {
  @ApiProperty({ description: 'Mã lớp học' })
  @IsNotEmpty({ message: 'Mã lớp học không được để trống' })
  @IsString()
  classroomId: string;

  @ApiProperty({ description: 'Mã học sinh' })
  @IsNotEmpty({ message: 'Mã học sinh không được để trống' })
  @IsString()
  studentId: string;

  @ApiProperty({ description: 'Ngày ghi nhận (YYYY-MM-DD)' })
  @IsNotEmpty({ message: 'Ngày ghi nhận không được để trống' })
  @IsDateString({}, { message: 'Định dạng ngày ghi nhận không hợp lệ' })
  recordDate: string;

  @ApiProperty({
    enum: BehaviorCategory,
    description: 'Danh mục nề nếp (DISCIPLINE, LEARNING, HYGIENE, TEAMWORK, RESPONSIBILITY, OTHER)',
  })
  @IsNotEmpty({ message: 'Danh mục nề nếp không được để trống' })
  @IsEnum(BehaviorCategory, { message: 'Danh mục nề nếp không hợp lệ' })
  category: BehaviorCategory;

  @ApiPropertyOptional({ description: 'Loại sự kiện nề nếp cụ thể' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  behaviorType?: string;

  @ApiProperty({
    enum: BehaviorLevel,
    description: 'Mức độ (POSITIVE, REMINDER, NEEDS_ATTENTION)',
  })
  @IsNotEmpty({ message: 'Mức độ nề nếp không được để trống' })
  @IsEnum(BehaviorLevel, { message: 'Mức độ nề nếp không hợp lệ' })
  level: BehaviorLevel;

  @ApiProperty({ description: 'Nội dung chi tiết ghi nhận' })
  @IsNotEmpty({ message: 'Nội dung ghi nhận không được để trống' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: 'Hướng xử lý của giáo viên' })
  @IsOptional()
  @IsString()
  resolution?: string;

  @ApiPropertyOptional({ description: 'Ghi chú nội bộ cần thiết' })
  @IsOptional()
  @IsString()
  note?: string;
}
