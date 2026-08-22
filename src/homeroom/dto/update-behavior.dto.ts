import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsDateString, MaxLength } from 'class-validator';
import { BehaviorCategory, BehaviorLevel } from '@prisma/client';

export class UpdateBehaviorRecordDto {
  @ApiPropertyOptional({ description: 'Ngày ghi nhận (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'Định dạng ngày ghi nhận không hợp lệ' })
  recordDate?: string;

  @ApiPropertyOptional({
    enum: BehaviorCategory,
    description: 'Danh mục nề nếp (DISCIPLINE, LEARNING, HYGIENE, TEAMWORK, RESPONSIBILITY, OTHER)',
  })
  @IsOptional()
  @IsEnum(BehaviorCategory, { message: 'Danh mục nề nếp không hợp lệ' })
  category?: BehaviorCategory;

  @ApiPropertyOptional({ description: 'Loại sự kiện nề nếp cụ thể' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  behaviorType?: string;

  @ApiPropertyOptional({
    enum: BehaviorLevel,
    description: 'Mức độ (POSITIVE, REMINDER, NEEDS_ATTENTION)',
  })
  @IsOptional()
  @IsEnum(BehaviorLevel, { message: 'Mức độ nề nếp không hợp lệ' })
  level?: BehaviorLevel;

  @ApiPropertyOptional({ description: 'Nội dung chi tiết ghi nhận' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: 'Hướng xử lý của giáo viên' })
  @IsOptional()
  @IsString()
  resolution?: string;

  @ApiPropertyOptional({ description: 'Ghi chú nội bộ cần thiết' })
  @IsOptional()
  @IsString()
  note?: string;
}
