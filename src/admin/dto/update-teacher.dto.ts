import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class UpdateTeacherDto {
  @ApiPropertyOptional({ example: 'lan@teachflow.vn', description: 'Địa chỉ email mới' })
  @IsOptional()
  @IsEmail({}, { message: 'Định dạng email không hợp lệ' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Thị Lan', description: 'Họ và tên mới' })
  @IsOptional()
  @IsString({ message: 'Họ và tên phải là chuỗi ký tự' })
  @MaxLength(100, { message: 'Họ và tên tối đa 100 ký tự' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName?: string;

  @ApiPropertyOptional({ example: '0988123456', description: 'Số điện thoại mới' })
  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự' })
  @MaxLength(20, { message: 'Số điện thoại tối đa 20 ký tự' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone?: string;
}
