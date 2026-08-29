import { IsString, MaxLength, MinLength } from 'class-validator';

export class HtmlGameSourceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80000)
  html: string;
}
