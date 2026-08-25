import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { LessonPlanExportService } from './lesson-plan-export.service';
import { WorksheetExportService } from './worksheet-export.service';
import { HomeroomExportService } from './homeroom-export.service';
import { TeacherBackupService } from './teacher-backup.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ExportController],
  providers: [
    ExportService,
    LessonPlanExportService,
    WorksheetExportService,
    HomeroomExportService,
    TeacherBackupService,
  ],
  exports: [
    ExportService,
    LessonPlanExportService,
    WorksheetExportService,
    HomeroomExportService,
    TeacherBackupService,
  ],
})
export class ExportModule {}

