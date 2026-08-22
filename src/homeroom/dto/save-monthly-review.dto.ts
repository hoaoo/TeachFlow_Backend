import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, Min, Max, IsOptional } from 'class-validator';

export class SaveMonthlyReviewDto {
  @ApiProperty({ description: 'Mã lớp học' })
  @IsNotEmpty({ message: 'Mã lớp học không được để trống' })
  @IsString()
  classroomId: string;

  @ApiPropertyOptional({ description: 'Mã năm học' })
  @IsOptional()
  @IsString()
  schoolYearId?: string;

  @ApiProperty({ description: 'Năm tổng kết', example: 2026 })
  @IsNotEmpty({ message: 'Năm không được để trống' })
  @IsInt()
  year: number;

  @ApiProperty({ description: 'Tháng tổng kết (1 - 12)', example: 8 })
  @IsNotEmpty({ message: 'Tháng không được để trống' })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiPropertyOptional({ description: 'Thành tích / Điểm nổi bật trong tháng' })
  @IsOptional()
  @IsString()
  highlights?: string;

  @ApiPropertyOptional({ description: 'Hạn chế còn tồn tại' })
  @IsOptional()
  @IsString()
  limitations?: string;

  @ApiPropertyOptional({ description: 'Kế hoạch trọng tâm tháng tiếp theo' })
  @IsOptional()
  @IsString()
  nextMonthPlan?: string;

  @ApiPropertyOptional({ description: 'Nhận xét chung' })
  @IsOptional() @IsString()
  generalComment?: string;

  @ApiPropertyOptional({ description: 'Khó khăn' })
  @IsOptional() @IsString()
  difficulties?: string;

  @ApiPropertyOptional({ description: 'Biện pháp' })
  @IsOptional() @IsString()
  measures?: string;

  @ApiPropertyOptional({ description: 'Hoạt động lớp trong tháng' })
  @IsOptional() @IsString()
  classActivities?: string;

  @ApiPropertyOptional({ description: 'Phiên bản optimistic concurrency', default: 1 })
  @IsOptional()
  @IsInt()
  version?: number = 1;
}
