import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AiChatDto {
  @ApiProperty({ description: 'Nội dung tin nhắn / câu hỏi gửi tới trợ lý AI' })
  @IsString()
  @IsNotEmpty({ message: 'Tin nhắn không được để trống' })
  message: string;

  @ApiPropertyOptional({ description: 'Lịch sử hội thoại trước đó dạng chuỗi JSON hoặc văn bản' })
  @IsString()
  @IsOptional()
  history?: string;

  @ApiPropertyOptional({ description: 'Ngữ cảnh bổ sung (môn học, khối lớp, lớp học, v.v.)' })
  @IsString()
  @IsOptional()
  context?: string;
}
