import { Module } from '@nestjs/common';
import { LessonPlansController } from './lesson-plans.controller';
import { LessonPlansService } from './lesson-plans.service';
import { DocxParserService } from './docx-parser.service';
import { ResourcesModule } from '../resources/resources.module';

@Module({
  imports: [ResourcesModule],
  controllers: [LessonPlansController],
  providers: [LessonPlansService, DocxParserService],
  exports: [LessonPlansService, DocxParserService],
})
export class LessonPlansModule {}

