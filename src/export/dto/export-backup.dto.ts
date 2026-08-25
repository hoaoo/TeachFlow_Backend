import { IsOptional, IsBoolean, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ExportBackupDto {
  @ApiPropertyOptional({ description: 'ID năm học muốn xuất dữ liệu (để trống = tất cả năm học)' })
  @IsOptional()
  @IsString()
  schoolYearId?: string;

  @ApiPropertyOptional({ description: 'Xuất danh sách học sinh', default: true })
  @IsOptional()
  @IsBoolean()
  includeStudents?: boolean = true;

  @ApiPropertyOptional({ description: 'Xuất dữ liệu điểm danh', default: true })
  @IsOptional()
  @IsBoolean()
  includeAttendance?: boolean = true;

  @ApiPropertyOptional({ description: 'Xuất kết quả đánh giá', default: true })
  @IsOptional()
  @IsBoolean()
  includeAssessments?: boolean = true;

  @ApiPropertyOptional({ description: 'Xuất nhận xét học sinh', default: true })
  @IsOptional()
  @IsBoolean()
  includeComments?: boolean = true;

  @ApiPropertyOptional({ description: 'Xuất danh sách giáo án', default: true })
  @IsOptional()
  @IsBoolean()
  includeLessonPlans?: boolean = true;

  @ApiPropertyOptional({ description: 'Xuất phiếu học tập', default: true })
  @IsOptional()
  @IsBoolean()
  includeWorksheets?: boolean = true;

  @ApiPropertyOptional({ description: 'Xuất metadata tài nguyên', default: true })
  @IsOptional()
  @IsBoolean()
  includeResources?: boolean = true;
}
