import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export enum AttendanceStatusEnum {
  PRESENT = 'PRESENT',
  EXCUSED_ABSENCE = 'EXCUSED_ABSENCE',
  UNEXCUSED_ABSENCE = 'UNEXCUSED_ABSENCE',
  LATE = 'LATE',
  // Frontend alias support
  ABSENT = 'UNEXCUSED_ABSENCE',
  EXCUSED = 'EXCUSED_ABSENCE',
}

export class ScheduleStudentAttendanceItemDto {
  @ApiProperty({ description: 'ID học sinh' })
  @IsString()
  @IsNotEmpty({ message: 'studentId không được để trống' })
  studentId: string;

  @ApiPropertyOptional({
    enum: ['PRESENT', 'EXCUSED_ABSENCE', 'UNEXCUSED_ABSENCE', 'LATE', 'ABSENT', 'EXCUSED'],
    default: 'PRESENT',
  })
  @IsOptional()
  @IsString()
  status?: string = 'PRESENT';

  @ApiPropertyOptional({ example: 5, description: 'Số phút đi muộn nếu LATE' })
  @IsOptional()
  @IsInt()
  @Min(0, { message: 'lateMinutes không được âm' })
  lateMinutes?: number = 0;

  @ApiPropertyOptional({ example: 'Nghỉ ốm có phép' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class SaveScheduleAttendanceDto {
  @ApiPropertyOptional({ description: 'Ghi chú chung cho tiết học' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ type: [ScheduleStudentAttendanceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleStudentAttendanceItemDto)
  attendances: ScheduleStudentAttendanceItemDto[];
}
