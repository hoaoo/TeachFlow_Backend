import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { TeachingMode } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { STRONG_PASSWORD_MESSAGE, STRONG_PASSWORD_REGEX } from '../../common/validation/password-policy';

export class CreateTeacherDto {
  @ApiProperty({ example: 'lan@teachflow.vn', description: 'Địa chỉ email của giáo viên' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Định dạng email không hợp lệ' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @ApiProperty({ example: 'Nguyễn Thị Lan', description: 'Họ và tên giáo viên' })
  @IsNotEmpty({ message: 'Họ và tên không được để trống' })
  @IsString({ message: 'Họ và tên phải là chuỗi ký tự' })
  @MaxLength(100, { message: 'Họ và tên tối đa 100 ký tự' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName: string;

  @ApiPropertyOptional({ example: '0988123456', description: 'Số điện thoại liên lạc' })
  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự' })
  @MaxLength(20, { message: 'Số điện thoại tối đa 20 ký tự' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone?: string;

  @ApiProperty({ example: 'Teacher@123', description: 'Mật khẩu tạm thời cho giáo viên' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @Matches(STRONG_PASSWORD_REGEX, { message: STRONG_PASSWORD_MESSAGE })
  password: string;

  @ApiPropertyOptional({ enum: TeachingMode, default: TeachingMode.SUBJECT_SPECIALIST })
  @IsOptional()
  @IsEnum(TeachingMode)
  teachingMode?: TeachingMode;
}
