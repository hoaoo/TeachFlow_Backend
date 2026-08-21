import { IsString, IsNotEmpty, IsDateString, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSchoolYearDto {
  @ApiProperty({ description: 'Tên năm học, ví dụ: 2026 - 2027', example: '2026 - 2027' })
  @IsString()
  @IsNotEmpty({ message: 'Tên năm học không được để trống' })
  name: string;

  @ApiProperty({ description: 'Ngày bắt đầu năm học', example: '2026-09-01' })
  @IsDateString({}, { message: 'Ngày bắt đầu không đúng định dạng YYYY-MM-DD' })
  startDate: string;

  @ApiProperty({ description: 'Ngày kết thúc năm học', example: '2027-05-31' })
  @IsDateString({}, { message: 'Ngày kết thúc không đúng định dạng YYYY-MM-DD' })
  endDate: string;

  @ApiPropertyOptional({ description: 'Đặt làm năm học hiện tại', default: false })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;

  @ApiPropertyOptional({ description: 'Trạng thái hoạt động', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
