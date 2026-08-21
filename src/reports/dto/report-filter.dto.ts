import { IsOptional, IsString, IsUUID, IsDateString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReportFilterDto {
  @ApiPropertyOptional({ description: 'ID năm học' })
  @IsOptional()
  @IsUUID('4', { message: 'schoolYearId phải là UUID hợp lệ' })
  schoolYearId?: string;

  @ApiPropertyOptional({ description: 'ID học kỳ' })
  @IsOptional()
  @IsUUID('4', { message: 'semesterId phải là UUID hợp lệ' })
  semesterId?: string;

  @ApiPropertyOptional({ description: 'ID lớp học' })
  @IsOptional()
  @IsUUID('4', { message: 'classroomId phải là UUID hợp lệ' })
  classroomId?: string;

  @ApiPropertyOptional({ description: 'ID môn học' })
  @IsOptional()
  @IsUUID('4', { message: 'subjectId phải là UUID hợp lệ' })
  subjectId?: string;

  @ApiPropertyOptional({ description: 'ID giáo viên' })
  @IsOptional()
  @IsUUID('4', { message: 'teacherId phải là UUID hợp lệ' })
  teacherId?: string;

  @ApiPropertyOptional({ description: 'Từ ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'dateFrom phải có định dạng YYYY-MM-DD' })
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'dateTo phải có định dạng YYYY-MM-DD' })
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Trang hiện tại (mặc định 1)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Số lượng mỗi trang (mặc định 50)', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
