import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ResourcesModule } from '../resources/resources.module';
import { AdminHtmlGamesController } from './admin-html-games.controller';
import { HtmlGamePackageService } from './html-game-package.service';
import { HtmlGamesController } from './html-games.controller';
import { HtmlGamesService } from './html-games.service';

@Module({
  imports: [PrismaModule, ResourcesModule],
  controllers: [AdminHtmlGamesController, HtmlGamesController],
  providers: [HtmlGamesService, HtmlGamePackageService],
  exports: [HtmlGamesService],
})
export class HtmlGamesModule {}
