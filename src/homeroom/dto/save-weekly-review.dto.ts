import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, Min, IsOptional } from 'class-validator';

export class SaveWeeklyReviewDto {
  @ApiProperty({ description: 'Mã lớp học' })
  @IsNotEmpty({ message: 'Mã lớp học không được để trống' })
  @IsString()
  classroomId: string;

  @ApiPropertyOptional({ description: 'Mã năm học (nếu để trống sẽ lấy năm học hiện tại)' })
  @IsOptional()
  @IsString()
  schoolYearId?: string;

  @ApiProperty({ description: 'Tuần học thứ mấy trong năm', example: 3 })
  @IsNotEmpty({ message: 'Số thứ tự tuần không được để trống' })
  @IsInt()
  @Min(1)
  weekNumber: number;

  @ApiPropertyOptional({ description: 'Điểm nổi bật trong tuần' })
  @IsOptional()
  @IsString()
  strengths?: string;

  @ApiPropertyOptional({ description: 'Hạn chế còn tồn tại trong tuần' })
  @IsOptional()
  @IsString()
  limitations?: string;

  @ApiPropertyOptional({ description: 'Kế hoạch trọng tâm tuần tới' })
  @IsOptional()
  @IsString()
  nextWeekPlan?: string;

  @ApiPropertyOptional({ description: 'Phiên bản để kiểm soát optimistic concurrency', default: 1 })
  @IsOptional()
  @IsInt()
  version?: number = 1;
}
