import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsISO8601 } from 'class-validator';

export class CreateEnrollmentDto {
  @ApiProperty({ example: 'student-uuid', description: 'ID học sinh' })
  @IsString()
  @IsNotEmpty({ message: 'ID học sinh không được để trống' })
  studentId: string;

  @ApiProperty({ example: 'school-year-uuid', description: 'ID năm học' })
  @IsString()
  @IsNotEmpty({ message: 'ID năm học không được để trống' })
  schoolYearId: string;

  @ApiProperty({ example: 'classroom-uuid', description: 'ID lớp học' })
  @IsString()
  @IsNotEmpty({ message: 'ID lớp học không được để trống' })
  classroomId: string;

  @ApiPropertyOptional({ example: '2026-09-05T00:00:00.000Z', description: 'Ngày nhập học' })
  @IsOptional()
  @IsISO8601({}, { message: 'Ngày nhập học phải đúng định dạng ISO8601' })
  enrolledAt?: string;

  @ApiPropertyOptional({ example: 'Ghi chú nhập học' })
  @IsOptional()
  @IsString()
  note?: string;
}
