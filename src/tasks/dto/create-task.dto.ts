import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({ example: 'Hoàn thiện giáo án Toán - Tuần 3' })
  @IsString()
  @IsNotEmpty({ message: 'Tiêu đề nhiệm vụ không được để trống' })
  title: string;

  @ApiPropertyOptional({ example: 'Hôm nay' })
  @IsOptional()
  @IsString()
  due?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

export class UpdateTaskDto {
  @ApiPropertyOptional({ example: 'Hoàn thiện giáo án Toán - Tuần 3' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Hôm nay' })
  @IsOptional()
  @IsString()
  due?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  done?: boolean;
}
