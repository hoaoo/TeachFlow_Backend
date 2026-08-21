import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksCleanupService } from './tasks-cleanup.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TasksCleanupService],
  exports: [TasksService, TasksCleanupService],
})
export class TasksModule {}
