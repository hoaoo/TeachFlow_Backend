import { HtmlGameStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateHtmlGameStatusDto {
  @IsEnum(HtmlGameStatus)
  status: HtmlGameStatus;
}
