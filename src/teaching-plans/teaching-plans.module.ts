import { Module } from '@nestjs/common';
import { TeachingPlansController } from './teaching-plans.controller';
import { TeachingPlansService } from './teaching-plans.service';

@Module({
  controllers: [TeachingPlansController],
  providers: [TeachingPlansService],
  exports: [TeachingPlansService],
})
export class TeachingPlansModule {}
