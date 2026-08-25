import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export interface CanvasDeskSeat {
  position: number;
  studentId?: string | null;
}

export interface CanvasDesk {
  id: string;
  name: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  seatCapacity: number;
  seats: CanvasDeskSeat[];
}

export interface CanvasLayout {
  canvas?: {
    width?: number;
    height?: number;
  };
  desks: CanvasDesk[];
}

export interface SeatingPositionInput {
  studentId: string;
  row: number;
  column: number;
  seatIndex?: number;
}

export class CreateSeatingPlanDto {
  @ApiProperty({ description: 'Tên sơ đồ chỗ ngồi', example: 'Sơ đồ chính HK1' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ default: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  rows?: number;

  @ApiPropertyOptional({ default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  columns?: number;

  @ApiPropertyOptional({ enum: [1, 2, 3, 4], default: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  seatsPerDesk?: number;

  @ApiPropertyOptional({ description: 'Cấu trúc layout canvas hoặc danh sách ghế' })
  @IsOptional()
  layout?: any;
}

export class UpdateSeatingPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  rows?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  columns?: number;

  @ApiPropertyOptional({ enum: [1, 2, 3, 4] })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  seatsPerDesk?: number;

  @ApiPropertyOptional({ description: 'Cấu trúc layout canvas hoặc danh sách ghế' })
  @IsOptional()
  layout?: any;
}