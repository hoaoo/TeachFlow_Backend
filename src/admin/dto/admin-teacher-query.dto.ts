import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class AdminTeacherQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái tài khoản',
    enum: ['ALL', 'ACTIVE', 'INACTIVE'],
    default: 'ALL',
  })
  @IsOptional()
  @IsString()
  @IsIn(['ALL', 'ACTIVE', 'INACTIVE'], {
    message: 'Trạng thái lọc phải là ALL, ACTIVE hoặc INACTIVE',
  })
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
}
