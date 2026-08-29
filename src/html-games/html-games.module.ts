import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ResourcesModule } from '../resources/resources.module';
import { AdminHtmlGamesController } from './admin-html-games.controller';
import { HtmlGamePackageService } from './html-game-package.service';
import { HtmlGamesController } from './html-games.controller';
import { HtmlGamesService } from './html-games.service';
import { HtmlGameQuestionsService } from './html-game-questions.service';
import { TeacherHtmlGamesController } from './teacher-html-games.controller';
import { TeacherHtmlGamesService } from './teacher-html-games.service';
import { HtmlGameRuntimeController } from './html-game-runtime.controller';

@Module({
  imports: [PrismaModule, ResourcesModule],
  controllers: [
    AdminHtmlGamesController,
    HtmlGamesController,
    TeacherHtmlGamesController,
    HtmlGameRuntimeController,
  ],
  providers: [
    HtmlGamesService,
    HtmlGamePackageService,
    HtmlGameQuestionsService,
    TeacherHtmlGamesService,
  ],
  exports: [HtmlGamesService, TeacherHtmlGamesService],
})
export class HtmlGamesModule {}
