import { Module } from '@nestjs/common';
import { StudentEnrollmentsService } from './student-enrollments.service';
import { StudentEnrollmentsController } from './student-enrollments.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StudentEnrollmentsController],
  providers: [StudentEnrollmentsService],
  exports: [StudentEnrollmentsService],
})
export class StudentEnrollmentsModule {}
