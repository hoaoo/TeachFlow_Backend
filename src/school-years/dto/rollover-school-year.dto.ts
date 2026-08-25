import { IsString, IsNotEmpty, IsDateString, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RolloverSchoolYearDto {
  @ApiProperty({ description: 'ID năm học nguồn cần đóng hoặc sao chép' })
  @IsString()
  @IsNotEmpty({ message: 'Mã năm học nguồn không được để trống' })
  sourceSchoolYearId: string;

  @ApiProperty({ description: 'Tên năm học mới, ví dụ: 2027 - 2028', example: '2027 - 2028' })
  @IsString()
  @IsNotEmpty({ message: 'Tên năm học mới không được để trống' })
  name: string;

  @ApiProperty({ description: 'Ngày bắt đầu năm học mới', example: '2027-09-01' })
  @IsDateString({}, { message: 'Ngày bắt đầu không đúng định dạng YYYY-MM-DD' })
  startDate: string;

  @ApiProperty({ description: 'Ngày kết thúc năm học mới', example: '2028-05-31' })
  @IsDateString({}, { message: 'Ngày kết thúc không đúng định dạng YYYY-MM-DD' })
  endDate: string;

  @ApiPropertyOptional({ description: 'Đóng năm học cũ sau khi chuyển', default: true })
  @IsOptional()
  @IsBoolean()
  closeSourceYear?: boolean = true;

  @ApiPropertyOptional({ description: 'Đặt làm năm học hiện tại', default: true })
  @IsOptional()
  @IsBoolean()
  setAsCurrent?: boolean = true;

  @ApiPropertyOptional({ description: 'Sao chép cấu hình lớp học', default: true })
  @IsOptional()
  @IsBoolean()
  copyClassrooms?: boolean = true;

  @ApiPropertyOptional({ description: 'Sao chép phân công môn học cho lớp', default: true })
  @IsOptional()
  @IsBoolean()
  copyClassSubjects?: boolean = true;

  @ApiPropertyOptional({ description: 'Sao chép mẫu giáo án của giáo viên', default: false })
  @IsOptional()
  @IsBoolean()
  copyLessonPlanTemplates?: boolean = false;

  @ApiPropertyOptional({ description: 'Sao chép mẫu phiếu học tập', default: false })
  @IsOptional()
  @IsBoolean()
  copyWorksheetTemplates?: boolean = false;

  @ApiPropertyOptional({ description: 'Sao chép mẫu nhận xét', default: false })
  @IsOptional()
  @IsBoolean()
  copyCommentTemplates?: boolean = false;
}
