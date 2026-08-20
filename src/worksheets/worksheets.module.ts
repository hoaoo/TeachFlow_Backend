import { Module } from '@nestjs/common';
import { WorksheetsController } from './worksheets.controller';
import { WorksheetsService } from './worksheets.service';

@Module({
  controllers: [WorksheetsController],
  providers: [WorksheetsService],
  exports: [WorksheetsService],
})
export class WorksheetsModule {}
