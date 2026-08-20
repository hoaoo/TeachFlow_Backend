import { Module } from '@nestjs/common';
import { ActivityLibraryController } from './activity-library.controller';
import { ActivityLibraryService } from './activity-library.service';

@Module({
  controllers: [ActivityLibraryController],
  providers: [ActivityLibraryService],
  exports: [ActivityLibraryService],
})
export class ActivityLibraryModule {}
