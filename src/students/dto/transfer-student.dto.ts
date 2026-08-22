import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TransferStudentDto {
  @ApiProperty({ example: 'class-uuid-destination' })
  @IsString({ message: 'Mã lớp đích phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Vui lòng chọn lớp học đích' })
  targetClassroomId: string;

  @ApiPropertyOptional({ example: 'Chuyển phân ban / theo nguyện vọng' })
  @IsOptional()
  @IsString()
  reason?: string;
}
