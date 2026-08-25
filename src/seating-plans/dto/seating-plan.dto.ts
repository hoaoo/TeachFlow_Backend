import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
export interface SeatingPositionInput { studentId: string; row: number; column: number; }
export class CreateSeatingPlanDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty() @IsInt() @Min(1) @Max(30) rows: number;
  @ApiProperty() @IsInt() @Min(1) @Max(30) columns: number;
  @ApiPropertyOptional({ type: 'array' }) @IsOptional() @IsArray() layout?: SeatingPositionInput[];
}
export class UpdateSeatingPlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(30) rows?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(30) columns?: number;
  @ApiPropertyOptional({ type: 'array' }) @IsOptional() @IsArray() layout?: SeatingPositionInput[];
}
