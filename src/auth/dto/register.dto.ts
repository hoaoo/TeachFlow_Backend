import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { STRONG_PASSWORD_MESSAGE, STRONG_PASSWORD_REGEX } from '../../common/validation/password-policy';

export class RegisterDto {
  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString({ message: 'Họ và tên phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Họ và tên không được để trống' })
  @MaxLength(100, { message: 'Họ và tên tối đa 100 ký tự' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName: string;

  @ApiProperty({ example: 'teacher@example.com' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email: string;

  @ApiProperty({ example: 'Teacher@123' })
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @Matches(STRONG_PASSWORD_REGEX, { message: STRONG_PASSWORD_MESSAGE })
  password: string;
}
