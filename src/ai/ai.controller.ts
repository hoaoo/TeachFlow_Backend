import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AiThrottlerGuard } from './guards/ai-throttler.guard';

import { GenerateLessonPlanDto } from './dto/generate-lesson-plan.dto';
import { GenerateActivityDto } from './dto/generate-activity.dto';
import { GenerateWorksheetDto } from './dto/generate-worksheet.dto';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import { GenerateStudentCommentDto } from './dto/generate-student-comment.dto';

@ApiTags('AI Assistant')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, AiThrottlerGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('lesson-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI tạo kế hoạch bài dạy (Giáo án) có cấu trúc chuẩn GDVN' })
  @ApiResponse({ status: 200, description: 'Giáo án được tạo thành công dạng JSON cấu trúc' })
  @ApiTooManyRequestsResponse({ description: 'Vượt quá giới hạn 20 yêu cầu/phút' })
  async generateLessonPlan(@Body() dto: GenerateLessonPlanDto) {
    return this.aiService.generateLessonPlan(dto);
  }

  @Post('activity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI thiết kế hoạt động dạy học chi tiết (Khởi động, Khám phá, Luyện tập, Vận dụng)' })
  @ApiResponse({ status: 200, description: 'Hoạt động dạy học được tạo thành công' })
  @ApiTooManyRequestsResponse({ description: 'Vượt quá giới hạn 20 yêu cầu/phút' })
  async generateActivity(@Body() dto: GenerateActivityDto) {
    return this.aiService.generateActivity(dto);
  }

  @Post('worksheet')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI biên soạn phiếu học tập và câu hỏi luyện tập' })
  @ApiResponse({ status: 200, description: 'Phiếu học tập được tạo thành công' })
  @ApiTooManyRequestsResponse({ description: 'Vượt quá giới hạn 20 yêu cầu/phút' })
  async generateWorksheet(@Body() dto: GenerateWorksheetDto) {
    return this.aiService.generateWorksheet(dto);
  }

  @Post('questions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI tạo bộ câu hỏi theo thang đo nhận thức Bloom' })
  @ApiResponse({ status: 200, description: 'Bộ câu hỏi được sinh thành công' })
  @ApiTooManyRequestsResponse({ description: 'Vượt quá giới hạn 20 yêu cầu/phút' })
  async generateQuestions(@Body() dto: GenerateQuestionsDto) {
    return this.aiService.generateQuestions(dto);
  }

  @Post('student-comment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI gợi ý nhận xét học sinh (Ẩn danh, bảo vệ tuyệt đối PII)' })
  @ApiResponse({ status: 200, description: 'Gợi ý nhận xét học sinh được tạo thành công' })
  @ApiTooManyRequestsResponse({ description: 'Vượt quá giới hạn 20 yêu cầu/phút' })
  async generateStudentComment(@Body() dto: GenerateStudentCommentDto) {
    return this.aiService.generateStudentComment(dto);
  }
}
