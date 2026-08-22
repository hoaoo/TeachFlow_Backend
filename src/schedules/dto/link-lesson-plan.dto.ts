import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class LinkLessonPlanDto {
  @ApiProperty({ description: 'ID giáo án liên kết (UUID)', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsUUID(4, { message: 'ID giáo án không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng cung cấp ID giáo án' })
  lessonPlanId: string;
}
