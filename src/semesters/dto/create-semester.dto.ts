import { IsString, IsNotEmpty, IsDateString, IsBoolean, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSemesterDto {
  @ApiProperty({ description: 'ID năm học', example: 'e9e50c01-6ebd-43cf-a128-abca025b0bff' })
  @IsString()
  @IsNotEmpty({ message: 'Mã năm học (schoolYearId) không được để trống' })
  schoolYearId: string;

  @ApiProperty({ description: 'Mã học kỳ (duy nhất trong năm học)', example: 'HK1' })
  @IsString()
  @IsNotEmpty({ message: 'Mã học kỳ không được để trống' })
  code: string;

  @ApiProperty({ description: 'Tên học kỳ', example: 'Học kỳ I' })
  @IsString()
  @IsNotEmpty({ message: 'Tên học kỳ không được để trống' })
  name: string;

  @ApiProperty({ description: 'Ngày bắt đầu học kỳ', example: '2026-09-01' })
  @IsDateString({}, { message: 'Ngày bắt đầu không đúng định dạng YYYY-MM-DD' })
  startDate: string;

  @ApiProperty({ description: 'Ngày kết thúc học kỳ', example: '2027-01-15' })
  @IsDateString({}, { message: 'Ngày kết thúc không đúng định dạng YYYY-MM-DD' })
  endDate: string;

  @ApiPropertyOptional({ description: 'Thứ tự sắp xếp', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Trạng thái hoạt động', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
