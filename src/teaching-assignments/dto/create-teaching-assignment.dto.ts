import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTeachingAssignmentDto {
  @ApiProperty({ example: 'teacher-uuid', description: 'ID giáo viên' })
  @IsString()
  @IsNotEmpty({ message: 'ID giáo viên không được để trống' })
  teacherId: string;

  @ApiProperty({ example: 'classroom-uuid', description: 'ID lớp học' })
  @IsString()
  @IsNotEmpty({ message: 'ID lớp học không được để trống' })
  classroomId: string;

  @ApiProperty({ example: 'subject-uuid', description: 'ID môn học' })
  @IsString()
  @IsNotEmpty({ message: 'ID môn học không được để trống' })
  subjectId: string;

  @ApiPropertyOptional({ example: 'school-year-uuid', description: 'ID năm học (nếu bỏ trống sẽ tự động lấy theo lớp học)' })
  @IsOptional()
  @IsString()
  schoolYearId?: string;
}
