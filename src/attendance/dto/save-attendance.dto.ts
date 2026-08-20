import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export enum AttendanceStatusEnum {
  PRESENT = 'PRESENT',
  EXCUSED_ABSENCE = 'EXCUSED_ABSENCE',
  UNEXCUSED_ABSENCE = 'UNEXCUSED_ABSENCE',
  LATE = 'LATE',
}

export class StudentAttendanceItemDto {
  @ApiProperty({ description: 'ID học sinh' })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiPropertyOptional({ enum: AttendanceStatusEnum, default: AttendanceStatusEnum.PRESENT })
  @IsOptional()
  @IsEnum(AttendanceStatusEnum)
  status?: AttendanceStatusEnum = AttendanceStatusEnum.PRESENT;

  @ApiPropertyOptional({ example: 'Đúng giờ' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class SaveAttendanceDto {
  @ApiProperty({ description: 'ID lớp học' })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ example: '2026-08-20' })
  @IsString()
  @IsNotEmpty()
  date: string;

  @ApiPropertyOptional({ example: 'MORNING' })
  @IsOptional()
  @IsString()
  sessionPeriod?: string;

  @ApiProperty({ type: [StudentAttendanceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StudentAttendanceItemDto)
  attendances: StudentAttendanceItemDto[];
}
