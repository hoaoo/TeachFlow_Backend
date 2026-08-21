import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSubjectDto {
  @ApiProperty({ description: 'Mã môn học (duy nhất, ví dụ: TOAN, TV, KH)', example: 'TOAN' })
  @IsString()
  @IsNotEmpty({ message: 'Mã môn học không được để trống' })
  code: string;

  @ApiProperty({ description: 'Tên môn học', example: 'Toán' })
  @IsString()
  @IsNotEmpty({ message: 'Tên môn học không được để trống' })
  name: string;

  @ApiPropertyOptional({ description: 'Trạng thái hoạt động dạng boolean', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Thứ tự sắp xếp', default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Trạng thái hoạt động dạng string', default: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;
}
