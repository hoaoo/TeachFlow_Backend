import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * DTO for teacher to update their own teaching context.
 * teacherId is NOT updatable — ownership is immutable once declared.
 * To change teacher, the current context must be deactivated and a new one declared.
 */
export class UpdateTeachingContextDto {
  @ApiPropertyOptional({ example: true, description: 'Trạng thái hoạt động của ngữ cảnh giảng dạy' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'subject-uuid', description: 'ID môn học (chỉ khi chưa có dữ liệu liên kết)' })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ example: 'classroom-uuid', description: 'ID lớp học (chỉ khi chưa có dữ liệu liên kết)' })
  @IsOptional()
  @IsString()
  classroomId?: string;
}

// Keep backward-compat alias used in service
export class UpdateTeachingAssignmentDto extends UpdateTeachingContextDto {}
