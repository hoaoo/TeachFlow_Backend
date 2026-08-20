import { PartialType } from '@nestjs/swagger';
import { CreateWorksheetDto } from './create-worksheet.dto';

export class UpdateWorksheetDto extends PartialType(CreateWorksheetDto) {}
