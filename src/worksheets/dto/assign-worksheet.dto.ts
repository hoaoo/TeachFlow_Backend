import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AssignWorksheetDto {
  @ApiProperty({ example: 'classroom-uuid' })
  @IsString()
  @IsNotEmpty()
  classroomId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ example: '2026-09-15T23:59:59+07:00' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}