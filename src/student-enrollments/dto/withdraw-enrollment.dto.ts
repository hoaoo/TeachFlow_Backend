import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsISO8601 } from 'class-validator';

export class WithdrawEnrollmentDto {
  @ApiPropertyOptional({ example: '2026-12-01T00:00:00.000Z', description: 'Ngày rút/nghỉ học' })
  @IsOptional()
  @IsISO8601({}, { message: 'Ngày nghỉ học phải đúng định dạng ISO8601' })
  withdrawDate?: string;

  @ApiPropertyOptional({ example: 'Chuyển trường về quê' })
  @IsOptional()
  @IsString()
  reason?: string;
}
