import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { STRONG_PASSWORD_MESSAGE, STRONG_PASSWORD_REGEX } from '../../common/validation/password-policy';

export class ResetPasswordDto {
  @ApiProperty({ example: 'Teacher@456', description: 'Mật khẩu mới' })
  @IsNotEmpty({ message: 'Mật khẩu mới không được để trống' })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @Matches(STRONG_PASSWORD_REGEX, { message: STRONG_PASSWORD_MESSAGE })
  newPassword: string;
}
