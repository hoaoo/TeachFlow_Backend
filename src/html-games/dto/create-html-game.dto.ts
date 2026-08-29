import { Type } from 'class-transformer';
import {
  IsOptional,
  IsBoolean,
  IsInt,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class HtmlGameThumbnailDto {
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  alt?: string;
}

export class CreateHtmlGameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => HtmlGameThumbnailDto)
  thumbnail?: HtmlGameThumbnailDto | null;

  @IsOptional()
  @IsUUID()
  gradeId?: string | null;

  @IsOptional()
  @IsUUID()
  subjectId?: string | null;

  @IsOptional()
  @IsBoolean()
  supportsQuestionConfig?: boolean;

  @IsOptional()
  @IsInt()
  configSchemaVersion?: number | null;
}
