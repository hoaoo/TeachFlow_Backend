import { Module } from '@nestjs/common';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { AcademicCalculationService } from './academic-calculation.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';

@Module({
  controllers: [AssessmentsController],
  providers: [
    AssessmentsService,
    AcademicCalculationService,
    TeachingAssignmentAuthorizationService,
  ],
  exports: [AssessmentsService, AcademicCalculationService],
})
export class AssessmentsModule {}
