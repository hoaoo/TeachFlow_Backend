import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateImageDto {
  @ApiProperty({ example: 'Học sinh lớp 4 đang chia bánh pizza thành các phần bằng nhau', description: 'Mô tả ảnh cần tạo' })
  @IsString()
  @IsNotEmpty({ message: 'Mô tả ảnh không được để trống' })
  @MaxLength(2000, { message: 'Mô tả ảnh tối đa 2000 ký tự' })
  prompt: string;

  @ApiPropertyOptional({ example: 'minh họa sách giáo khoa', description: 'Phong cách hình ảnh' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  style?: string;

  @ApiPropertyOptional({
    example: '1:1',
    description: 'Tỷ lệ ảnh',
    enum: ['1:1', '4:3', '3:4', '16:9', '9:16'],
  })
  @IsOptional()
  @IsIn(['1:1', '4:3', '3:4', '16:9', '9:16'], { message: 'Tỷ lệ ảnh không hợp lệ' })
  aspectRatio?: string;

  @ApiPropertyOptional({
    example: 'lesson-plan',
    description: 'Mục đích sử dụng',
    enum: ['lesson-plan', 'worksheet', 'resource'],
  })
  @IsOptional()
  @IsIn(['lesson-plan', 'worksheet', 'resource'])
  purpose?: string;

  @ApiPropertyOptional({ example: 'Phân số bằng nhau', description: 'Tên hiển thị của ảnh trong kho tài nguyên' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Gắn ảnh vào giáo án sau khi tạo (nếu giáo án thuộc giáo viên hiện tại)' })
  @IsOptional()
  @IsString()
  lessonPlanId?: string;
}
