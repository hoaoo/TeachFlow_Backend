import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsIn, IsBoolean } from 'class-validator';

export class UpdateScheduleStatusDto {
  @ApiProperty({
    description: 'Trạng thái tiết dạy',
    enum: ['PLANNED', 'IN_PROGRESS', 'TAUGHT', 'CANCELLED'],
    example: 'IN_PROGRESS',
  })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng cung cấp trạng thái' })
  @IsIn(['PLANNED', 'IN_PROGRESS', 'TAUGHT', 'CANCELLED'], {
    message: 'Trạng thái phải là PLANNED, IN_PROGRESS, TAUGHT hoặc CANCELLED',
  })
  status: string;

  @ApiPropertyOptional({ description: 'Giờ bắt đầu thực tế (HH:mm)', example: '07:02' })
  @IsString()
  @IsOptional()
  actualStartTime?: string;

  @ApiPropertyOptional({ description: 'Giờ kết thúc thực tế (HH:mm)', example: '07:48' })
  @IsString()
  @IsOptional()
  actualEndTime?: string;

  @ApiPropertyOptional({ description: 'Ghi chú sau tiết dạy' })
  @IsString()
  @IsOptional()
  postLessonNotes?: string;

  @ApiPropertyOptional({ description: 'Đánh dấu manual status', default: true })
  @IsBoolean()
  @IsOptional()
  isManualStatus?: boolean;
}
