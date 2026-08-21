import { IsString, IsNotEmpty, IsInt, IsBoolean, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGradeDto {
  @ApiProperty({ description: 'Tên khối, ví dụ: Khối 1, Khối 2', example: 'Khối 1' })
  @IsString()
  @IsNotEmpty({ message: 'Tên khối không được để trống' })
  name: string;

  @ApiProperty({ description: 'Cấp độ khối (số nguyên dương: 1, 2, 3, 4, 5...)', example: 1 })
  @IsInt({ message: 'Cấp độ khối phải là số nguyên' })
  @Min(1, { message: 'Cấp độ khối phải lớn hơn hoặc bằng 1' })
  level: number;

  @ApiPropertyOptional({ description: 'Mã khối, ví dụ: K01, 01', example: 'K01' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'Thứ tự sắp xếp', default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Trạng thái hoạt động', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
