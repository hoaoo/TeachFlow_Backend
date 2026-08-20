import { PartialType } from '@nestjs/swagger';
import { CreateLibraryActivityDto } from './create-activity.dto';

export class UpdateLibraryActivityDto extends PartialType(CreateLibraryActivityDto) {}
