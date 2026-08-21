import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateTeachingAssignmentDto {
  @ApiPropertyOptional({ example: true, description: 'Trạng thái hoạt động của phân công giảng dạy' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'subject-uuid', description: 'ID môn học' })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ example: 'classroom-uuid', description: 'ID lớp học' })
  @IsOptional()
  @IsString()
  classroomId?: string;

  @ApiPropertyOptional({ example: 'teacher-uuid', description: 'ID giáo viên' })
  @IsOptional()
  @IsString()
  teacherId?: string;
}
