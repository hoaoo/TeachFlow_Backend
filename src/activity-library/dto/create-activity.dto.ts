import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateLibraryActivityDto {
  @ApiProperty({ example: 'Bingo phân số' })
  @IsString()
  @IsNotEmpty({ message: 'Tên hoạt động không được để trống' })
  title: string;

  @ApiPropertyOptional({ example: 'Trò chơi' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'Toán' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ example: 'Lớp 4' })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional({ example: 'Củng cố nhận biết các phân số bằng nhau' })
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({ example: 'Trò chơi học tập, thảo luận nhóm' })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ example: 'Think-Pair-Share, Tia chớp' })
  @IsOptional()
  @IsString()
  technique?: string;

  @ApiPropertyOptional({ example: 'Giao tiếp và hợp tác' })
  @IsOptional()
  @IsString()
  competencies?: string;

  @ApiPropertyOptional({ example: 'Chăm chỉ, trung thực' })
  @IsOptional()
  @IsString()
  qualities?: string;

  @ApiPropertyOptional({ example: 'Bảng bingo, thẻ số, máy chiếu' })
  @IsOptional()
  @IsString()
  equipment?: string;

  @ApiPropertyOptional({ example: 'GV phát phiếu bingo, quay số ngẫu nhiên...' })
  @IsOptional()
  @IsString()
  teacherActivity?: string;

  @ApiPropertyOptional({ example: 'HS quan sát, đánh dấu các phân số tương ứng...' })
  @IsOptional()
  @IsString()
  studentActivity?: string;

  @ApiPropertyOptional({ example: 'Ai hoàn thành hàng ngang/dọc trước thì hô Bingo!' })
  @IsOptional()
  @IsString()
  gameRules?: string;

  @ApiPropertyOptional({ description: 'Danh sách câu hỏi / đáp án' })
  @IsOptional()
  questionsJson?: any;

  @ApiPropertyOptional({ example: 'Mô tả tóm tắt hoạt động' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Grid2X2' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
