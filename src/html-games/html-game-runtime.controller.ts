import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { TEACHFLOW_GAME_RUNTIME_SOURCE } from './html-game-runtime';

@Controller('html-games/runtime')
export class HtmlGameRuntimeController {
  @Public()
  @Get('teachflow-game-runtime.js')
  runtime(@Res() response: Response) {
    response
      .type('application/javascript')
      .setHeader('Cache-Control', 'public, max-age=3600')
      .send(TEACHFLOW_GAME_RUNTIME_SOURCE);
  }
}
