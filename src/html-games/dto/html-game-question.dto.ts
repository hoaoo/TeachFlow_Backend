import { HtmlGameQuestionType } from '@prisma/client';
import {
  IsArray,
  IsDefined,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';

export class CreateHtmlGameQuestionDto {
  @IsInt()
  @Min(0)
  @Max(9999)
  order: number;

  @IsString()
  @MaxLength(5000)
  question: string;

  @IsEnum(HtmlGameQuestionType)
  type: HtmlGameQuestionType;

  @IsOptional()
  options?: unknown;

  @IsDefined()
  correctAnswer: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  explanation?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class UpdateHtmlGameQuestionDto extends PartialType(CreateHtmlGameQuestionDto) {}

export class ReorderHtmlGameQuestionsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  questionIds: string[];
}

export class UpdateTeacherHtmlGameDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;
}
