import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateActivityDto {
  @ApiPropertyOptional({ example: 'Khởi động' })
  @IsOptional()
  @IsString()
  phase?: string;

  @ApiProperty({ example: 'Trò chơi: Ai nhanh hơn?' })
  @IsString({ message: 'Tên hoạt động không được để trống' })
  @IsNotEmpty({ message: 'Tên hoạt động không được để trống' })
  title: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  minutes?: number;

  @ApiPropertyOptional({ example: 'Trò chơi học tập' })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ example: 'Động não' })
  @IsOptional()
  @IsString()
  technique?: string;

  @ApiPropertyOptional({ example: 'Giao tiếp và hợp tác' })
  @IsOptional()
  @IsString()
  competencies?: string;

  @ApiPropertyOptional({ example: 'Chăm chỉ' })
  @IsOptional()
  @IsString()
  qualities?: string;

  @ApiPropertyOptional({ example: 'Máy chiếu, thẻ số, bảng phụ' })
  @IsOptional()
  @IsString()
  equipment?: string;

  @ApiPropertyOptional({ example: 'Tạo hứng thú và kết nối kiến thức.' })
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({ example: 'GV tổ chức trò chơi...' })
  @IsOptional()
  @IsString()
  teacher?: string;

  @ApiPropertyOptional({ example: 'HS tham gia trò chơi...' })
  @IsOptional()
  @IsString()
  students?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
