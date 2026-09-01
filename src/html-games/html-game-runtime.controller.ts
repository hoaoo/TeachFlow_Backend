import { Controller, Get, HttpStatus, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { TEACHFLOW_GAME_RUNTIME_SOURCE } from './html-game-runtime';
import { ObjectStorageService } from '../resources/storage/object-storage.service';

@Controller('html-games')
export class HtmlGameRuntimeController {
  constructor(private readonly objectStorage: ObjectStorageService) {}

  @Public()
  @Get('runtime/teachflow-game-runtime.js')
  runtime(@Res() response: Response) {
    response
      .type('application/javascript')
      .setHeader('Cache-Control', 'public, max-age=3600')
      .send(TEACHFLOW_GAME_RUNTIME_SOURCE);
  }

  @Public()
  @Get('public/*')
  async servePublicFile(@Req() req: Request, @Res() res: Response) {
    const rawPath = (req.params as any)[0] || '';
    const fileInfo = await this.objectStorage.getLocalFileStream(rawPath);
    res.writeHead(HttpStatus.OK, {
      'Content-Type': fileInfo.contentType,
      'Content-Length': fileInfo.size,
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    return fileInfo.stream.pipe(res);
  }
}
