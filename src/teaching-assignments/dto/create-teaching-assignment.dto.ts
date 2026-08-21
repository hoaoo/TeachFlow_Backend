import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * DTO for teacher to self-declare their teaching context (lớp/môn đang dạy).
 * teacherId is NOT included — it is always derived from the authenticated JWT token.
 */
export class CreateTeachingContextDto {
  @ApiProperty({ example: 'classroom-uuid', description: 'ID lớp học giáo viên đang phụ trách' })
  @IsString()
  @IsNotEmpty({ message: 'ID lớp học không được để trống' })
  classroomId: string;

  @ApiProperty({ example: 'subject-uuid', description: 'ID môn học giáo viên đang giảng dạy' })
  @IsString()
  @IsNotEmpty({ message: 'ID môn học không được để trống' })
  subjectId: string;

  @ApiPropertyOptional({ example: 'school-year-uuid', description: 'ID năm học (nếu bỏ trống sẽ tự động lấy theo lớp học)' })
  @IsOptional()
  @IsString()
  schoolYearId?: string;
}

// Keep backward-compat alias used in service
export class CreateTeachingAssignmentDto extends CreateTeachingContextDto {
  // teacherId is injected by controller from JWT — never sent by client
  teacherId!: string;
}
