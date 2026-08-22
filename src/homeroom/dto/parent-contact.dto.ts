import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ParentContactMethod } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateParentContactDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  studentId: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @IsDateString()
  contactDate: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  guardianName?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  relationship?: string;

  @ApiProperty({ enum: ParentContactMethod })
  @IsEnum(ParentContactMethod)
  method: ParentContactMethod;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  content: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  outcome?: string;
}
