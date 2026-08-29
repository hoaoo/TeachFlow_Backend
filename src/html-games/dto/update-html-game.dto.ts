import { PartialType } from '@nestjs/swagger';
import { CreateHtmlGameDto } from './create-html-game.dto';

export class UpdateHtmlGameDto extends PartialType(CreateHtmlGameDto) {}
