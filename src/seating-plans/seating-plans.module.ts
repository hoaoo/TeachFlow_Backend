import { Module } from '@nestjs/common';
import { SeatingPlansController } from './seating-plans.controller';
import { SeatingPlansService } from './seating-plans.service';
@Module({ controllers: [SeatingPlansController], providers: [SeatingPlansService] })
export class SeatingPlansModule {}
