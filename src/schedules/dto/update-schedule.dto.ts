import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateScheduleDto } from './create-schedule.dto';
import { IsOptional, IsString, IsIn } from 'class-validator';

export class UpdateScheduleDto extends PartialType(CreateScheduleDto) {
  @ApiPropertyOptional({
    description: 'Phạm vi cập nhật khi lịch thuộc chuỗi lặp',
    enum: ['THIS_ONLY', 'THIS_AND_FUTURE', 'ALL'],
    default: 'THIS_ONLY',
  })
  @IsString()
  @IsOptional()
  @IsIn(['THIS_ONLY', 'THIS_AND_FUTURE', 'ALL'], {
    message: 'Phạm vi cập nhật phải là THIS_ONLY, THIS_AND_FUTURE hoặc ALL',
  })
  recurrenceScope?: 'THIS_ONLY' | 'THIS_AND_FUTURE' | 'ALL';

  @ApiPropertyOptional({ description: 'Giờ bắt đầu thực tế (HH:mm)', example: '07:05' })
  @IsString()
  @IsOptional()
  actualStartTime?: string;

  @ApiPropertyOptional({ description: 'Giờ kết thúc thực tế (HH:mm)', example: '07:50' })
  @IsString()
  @IsOptional()
  actualEndTime?: string;

  @ApiPropertyOptional({ description: 'Ghi chú sau tiết dạy', example: 'Học sinh nắm bài tốt, cần củng cố bài tập 3' })
  @IsString()
  @IsOptional()
  postLessonNotes?: string;
}
