import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
export class GenerateHomeroomSummaryDto {
  @ApiProperty() @IsString() @IsNotEmpty() classroomId: string;
  @ApiProperty({ enum: ['WEEK', 'MONTH'] }) @IsIn(['WEEK', 'MONTH']) period: 'WEEK' | 'MONTH';
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(53) weekNumber?: number;
}
