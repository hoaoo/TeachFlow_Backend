import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { BehaviorCategory, BehaviorLevel } from '@prisma/client';

export class QueryBehaviorDto {
  @ApiPropertyOptional({ description: 'Mã lớp học' })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ description: 'Mã học sinh' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Từ ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ enum: BehaviorCategory, description: 'Lọc theo danh mục' })
  @IsOptional()
  @IsEnum(BehaviorCategory)
  category?: BehaviorCategory;

  @ApiPropertyOptional({ description: 'Lọc theo loại sự kiện cụ thể' })
  @IsOptional()
  @IsString()
  behaviorType?: string;

  @ApiPropertyOptional({ enum: BehaviorLevel, description: 'Lọc theo mức độ' })
  @IsOptional()
  @IsEnum(BehaviorLevel)
  level?: BehaviorLevel;

  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm trong nội dung hoặc tên HS' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Số trang (1-indexed)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Số bản ghi trên trang (10, 20, 50)', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 10;
}
