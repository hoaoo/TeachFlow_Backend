import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
export interface SeatingPositionInput { studentId: string; row: number; column: number; seatIndex?: number; }
export class CreateSeatingPlanDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty() @IsInt() @Min(1) @Max(30) rows: number;
  @ApiProperty() @IsInt() @Min(1) @Max(30) columns: number;
  @ApiPropertyOptional({ enum: [2, 4], default: 2 }) @IsOptional() @IsInt() @IsIn([2, 4]) seatsPerDesk?: number;
  @ApiPropertyOptional({ type: 'array' }) @IsOptional() @IsArray() layout?: SeatingPositionInput[];
}
export class UpdateSeatingPlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(30) rows?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(30) columns?: number;
  @ApiPropertyOptional({ enum: [2, 4] }) @IsOptional() @IsInt() @IsIn([2, 4]) seatsPerDesk?: number;
  @ApiPropertyOptional({ type: 'array' }) @IsOptional() @IsArray() layout?: SeatingPositionInput[];
}