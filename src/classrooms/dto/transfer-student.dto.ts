import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TransferStudentDto {
  @ApiProperty({ description: 'ID Lớp học đích sẽ chuyển học sinh sang', example: '14cf8399-d149-46a6-b44c-f9b4cbbbae1e' })
  @IsString({ message: 'Mã lớp đích phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Lớp đích không được để trống' })
  targetClassroomId: string;

  @ApiPropertyOptional({ description: 'Ngày chuyển lớp', example: '2026-08-23' })
  @IsOptional()
  @IsString()
  transferDate?: string;

  @ApiPropertyOptional({ description: 'Lý do chuyển lớp', example: 'Chuyển phân ban/chuyển lớp học' })
  @IsOptional()
  @IsString()
  reason?: string;
}
