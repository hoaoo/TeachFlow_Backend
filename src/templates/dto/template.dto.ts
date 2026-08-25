import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
export const TEMPLATE_TYPES = ['LESSON_PLAN', 'WORKSHEET', 'STUDENT_COMMENT', 'TEACHING_ACTIVITY'] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];
export class CreateTemplateDto {
  @ApiProperty({ enum: TEMPLATE_TYPES }) @IsString() @IsIn(TEMPLATE_TYPES) type: TemplateType;
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsObject() content: Record<string, unknown>;
}
export class UpdateTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() content?: Record<string, unknown>;
}
