import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { HomeroomService } from './homeroom.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreateBehaviorRecordDto } from './dto/create-behavior.dto';
import { UpdateBehaviorRecordDto } from './dto/update-behavior.dto';
import { QueryBehaviorDto } from './dto/query-behavior.dto';
import { SaveWeeklyReviewDto } from './dto/save-weekly-review.dto';
import { SaveMonthlyReviewDto } from './dto/save-monthly-review.dto';
import { buildContentDisposition } from '../export/export.utils';

@ApiTags('Homeroom')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('homeroom')
export class HomeroomController {
  constructor(private readonly homeroomService: HomeroomService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Lấy dữ liệu tổng quan bảng điều khiển Chủ nhiệm' })
  @ApiQuery({ name: 'classId', required: false, description: 'Mã lớp chủ nhiệm' })
  async getDashboard(
    @Query('classId') classId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.homeroomService.getDashboard(classId, user.teacherId);
  }

  @Get('students-need-attention')
  @ApiOperation({ summary: 'Lấy danh sách học sinh cần quan tâm (Rule-based trong 30 ngày qua)' })
  @ApiQuery({ name: 'classId', required: true, description: 'Mã lớp học' })
  async getStudentsNeedAttention(
    @Query('classId') classId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.homeroomService.getStudentsNeedAttention(classId, user.teacherId);
  }

  @Get('upcoming-birthdays')
  @ApiOperation({ summary: 'Lấy danh sách sinh nhật học sinh sắp tới' })
  @ApiQuery({ name: 'classId', required: true, description: 'Mã lớp học' })
  @ApiQuery({ name: 'days', required: false, description: 'Số ngày đếm trước (mặc định 30 ngày)' })
  async getUpcomingBirthdays(
    @Query('classId') classId: string,
    @Query('days') days: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const daysNum = days ? parseInt(days, 10) : 30;
    return this.homeroomService.getUpcomingBirthdays(classId, user.teacherId, daysNum);
  }

  @Get('behavior')
  @ApiOperation({ summary: 'Lấy danh sách ghi nhận nề nếp kèm lọc và phân trang' })
  async getBehaviorRecords(
    @Query() query: QueryBehaviorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.homeroomService.getBehaviorRecords(query, user.teacherId);
  }

  @Post('behavior')
  @ApiOperation({ summary: 'Tạo ghi nhận nề nếp mới cho học sinh' })
  async createBehaviorRecord(
    @Body() dto: CreateBehaviorRecordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.homeroomService.createBehaviorRecord(dto, user.teacherId);
  }

  @Patch('behavior/:id')
  @ApiOperation({ summary: 'Cập nhật ghi nhận nề nếp' })
  async updateBehaviorRecord(
    @Param('id') id: string,
    @Body() dto: UpdateBehaviorRecordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.homeroomService.updateBehaviorRecord(id, dto, user.teacherId);
  }

  @Delete('behavior/:id')
  @ApiOperation({ summary: 'Xóa ghi nhận nề nếp' })
  async deleteBehaviorRecord(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.homeroomService.deleteBehaviorRecord(id, user.teacherId);
  }

  @Get('weekly-summary')
  @ApiOperation({ summary: 'Lấy số liệu tổng hợp tự động theo tuần' })
  @ApiQuery({ name: 'classId', required: true })
  @ApiQuery({ name: 'weekNumber', required: true })
  @ApiQuery({ name: 'schoolYearId', required: false })
  async getWeeklySummary(
    @Query('classId') classId: string,
    @Query('weekNumber') weekNumber: string,
    @Query('schoolYearId') schoolYearId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.homeroomService.getWeeklySummary(
      classId,
      parseInt(weekNumber || '1', 10),
      schoolYearId,
      user.teacherId,
    );
  }

  @Get('weekly-review')
  @ApiOperation({ summary: 'Lấy nội dung nhận xét tuần của giáo viên' })
  @ApiQuery({ name: 'classId', required: true })
  @ApiQuery({ name: 'weekNumber', required: true })
  @ApiQuery({ name: 'schoolYearId', required: false })
  async getWeeklyReview(
    @Query('classId') classId: string,
    @Query('weekNumber') weekNumber: string,
    @Query('schoolYearId') schoolYearId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.homeroomService.getWeeklyReview(
      classId,
      parseInt(weekNumber || '1', 10),
      schoolYearId,
      user.teacherId,
    );
  }

  @Put('weekly-review')
  @ApiOperation({ summary: 'Lưu hoặc cập nhật nhận xét tuần (Optimistic concurrency)' })
  async saveWeeklyReview(
    @Body() dto: SaveWeeklyReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.homeroomService.saveWeeklyReview(dto, user.teacherId);
  }

  @Get('monthly-summary')
  @ApiOperation({ summary: 'Lấy số liệu tổng hợp báo cáo tháng' })
  @ApiQuery({ name: 'classId', required: true })
  @ApiQuery({ name: 'year', required: true })
  @ApiQuery({ name: 'month', required: true })
  async getMonthlySummary(
    @Query('classId') classId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.homeroomService.getMonthlySummary(
      classId,
      parseInt(year || '2026', 10),
      parseInt(month || '8', 10),
      user.teacherId,
    );
  }

  @Get('monthly-review')
  @ApiOperation({ summary: 'Lấy nội dung nhận xét tháng của giáo viên' })
  @ApiQuery({ name: 'classId', required: true })
  @ApiQuery({ name: 'year', required: true })
  @ApiQuery({ name: 'month', required: true })
  async getMonthlyReview(
    @Query('classId') classId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.homeroomService.getMonthlyReview(
      classId,
      parseInt(year || '2026', 10),
      parseInt(month || '8', 10),
      user.teacherId,
    );
  }

  @Put('monthly-review')
  @ApiOperation({ summary: 'Lưu hoặc cập nhật nhận xét tháng (Optimistic concurrency)' })
  async saveMonthlyReview(
    @Body() dto: SaveMonthlyReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.homeroomService.saveMonthlyReview(dto, user.teacherId);
  }

  // --- Export Endpoints ---

  @Get('weekly-review/export/docx')
  @ApiOperation({ summary: 'Xuất báo cáo chủ nhiệm tuần ra file Word (.docx)' })
  @ApiQuery({ name: 'classId', required: true })
  @ApiQuery({ name: 'weekNumber', required: true })
  @ApiQuery({ name: 'schoolYearId', required: false })
  async exportWeeklyReviewDocx(
    @Query('classId') classId: string,
    @Query('weekNumber') weekNumber: string,
    @Query('schoolYearId') schoolYearId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { buffer, asciiFilename, utf8Filename } =
      await this.homeroomService.exportWeeklyReview(
        classId,
        parseInt(weekNumber || '1', 10),
        schoolYearId,
        user.teacherId,
        'docx',
      );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', buildContentDisposition(asciiFilename, utf8Filename));
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  }

  @Get('weekly-review/export/pdf')
  @ApiOperation({ summary: 'Xuất báo cáo chủ nhiệm tuần ra file PDF in ấn' })
  @ApiQuery({ name: 'classId', required: true })
  @ApiQuery({ name: 'weekNumber', required: true })
  @ApiQuery({ name: 'schoolYearId', required: false })
  async exportWeeklyReviewPdf(
    @Query('classId') classId: string,
    @Query('weekNumber') weekNumber: string,
    @Query('schoolYearId') schoolYearId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { buffer, asciiFilename, utf8Filename } =
      await this.homeroomService.exportWeeklyReview(
        classId,
        parseInt(weekNumber || '1', 10),
        schoolYearId,
        user.teacherId,
        'pdf',
      );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', buildContentDisposition(asciiFilename, utf8Filename));
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  }

  @Get('monthly-summary/export/docx')
  @ApiOperation({ summary: 'Xuất báo cáo chủ nhiệm tháng ra file Word (.docx)' })
  @ApiQuery({ name: 'classId', required: true })
  @ApiQuery({ name: 'year', required: true })
  @ApiQuery({ name: 'month', required: true })
  async exportMonthlySummaryDocx(
    @Query('classId') classId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { buffer, asciiFilename, utf8Filename } =
      await this.homeroomService.exportMonthlySummary(
        classId,
        parseInt(year || '2026', 10),
        parseInt(month || '8', 10),
        user.teacherId,
        'docx',
      );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', buildContentDisposition(asciiFilename, utf8Filename));
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  }

  @Get('monthly-summary/export/pdf')
  @ApiOperation({ summary: 'Xuất báo cáo chủ nhiệm tháng ra file PDF' })
  @ApiQuery({ name: 'classId', required: true })
  @ApiQuery({ name: 'year', required: true })
  @ApiQuery({ name: 'month', required: true })
  async exportMonthlySummaryPdf(
    @Query('classId') classId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { buffer, asciiFilename, utf8Filename } =
      await this.homeroomService.exportMonthlySummary(
        classId,
        parseInt(year || '2026', 10),
        parseInt(month || '8', 10),
        user.teacherId,
        'pdf',
      );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', buildContentDisposition(asciiFilename, utf8Filename));
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  }
}
