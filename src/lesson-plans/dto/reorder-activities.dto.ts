import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class ReorderActivitiesDto {
  @ApiProperty({ description: 'Danh sách ID hoạt động theo thứ tự mới', type: [String] })
  @IsArray()
  @IsString({ each: true })
  activityIds: string[];
}
