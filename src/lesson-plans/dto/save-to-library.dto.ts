import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsInt, Min } from 'class-validator';

export class SaveActivityToLibraryDto {
  @ApiProperty({ example: 'Trò chơi: Ai nhanh hơn?' })
  @IsString()
  @IsNotEmpty({ message: 'Tên hoạt động không được để trống' })
  title: string;

  @ApiPropertyOptional({ example: 'Mô tả chi tiết cách tổ chức hoạt động...' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Khởi động' })
  @IsOptional()
  @IsString()
  typeName?: string;

  @ApiPropertyOptional({ example: 'Toán' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ example: 'Lớp 4' })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional({ example: 'Grid2X2' })
  @IsOptional()
  @IsString()
  icon?: string;
}
