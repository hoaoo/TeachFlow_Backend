import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsISO8601 } from 'class-validator';

export class TransferEnrollmentDto {
  @ApiProperty({ example: 'target-classroom-uuid', description: 'ID lớp học chuyển đến' })
  @IsString()
  @IsNotEmpty({ message: 'Lớp học chuyển đến không được để trống' })
  targetClassroomId: string;

  @ApiPropertyOptional({ example: '2026-11-16T00:00:00.000Z', description: 'Ngày chuyển lớp' })
  @IsOptional()
  @IsISO8601({}, { message: 'Ngày chuyển lớp phải đúng định dạng ISO8601' })
  transferDate?: string;

  @ApiPropertyOptional({ example: 'Chuyển phân ban/yêu cầu gia đình' })
  @IsOptional()
  @IsString()
  reason?: string;
}
