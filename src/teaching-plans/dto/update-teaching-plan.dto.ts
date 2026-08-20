import { PartialType } from '@nestjs/swagger';
import { CreateTeachingPlanDto } from './create-teaching-plan.dto';

export class UpdateTeachingPlanDto extends PartialType(CreateTeachingPlanDto) {}
