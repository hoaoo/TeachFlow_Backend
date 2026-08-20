import { IsBoolean, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTeacherStatusDto {
  @ApiProperty({ example: true, description: 'Trạng thái kích hoạt tài khoản' })
  @IsNotEmpty({ message: 'Trạng thái isActive không được để trống' })
  @IsBoolean({ message: 'isActive phải là giá trị boolean (true/false)' })
  isActive: boolean;
}
