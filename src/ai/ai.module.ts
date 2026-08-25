import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiThrottlerGuard } from './guards/ai-throttler.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { ResourcesModule } from '../resources/resources.module';
import { GeminiProvider } from './providers/gemini.provider';
import { LessonPlanAiService } from './lesson-plan-ai.service';
import { WorksheetAiService } from './worksheet-ai.service';
import { ImageAiService } from './image-ai.service';
import { ImportAiService } from './import-ai.service';

@Module({
  imports: [PrismaModule, ResourcesModule],
  controllers: [AiController],
  providers: [
    GeminiProvider,
    LessonPlanAiService,
    WorksheetAiService,
    ImageAiService,
    ImportAiService,
    AiService,
    AiThrottlerGuard,
  ],
  exports: [AiService, GeminiProvider],
})
export class AiModule {}
