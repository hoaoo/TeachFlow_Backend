import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsInt, IsOptional } from 'class-validator';
import { CreateLessonPlanDto } from './create-lesson-plan.dto';

export class UpdateLessonPlanDto extends PartialType(CreateLessonPlanDto) {
  @ApiPropertyOptional({ description: 'Version hiện tại phục vụ optimistic concurrency control' })
  @IsOptional()
  @IsInt()
  version?: number;
}
