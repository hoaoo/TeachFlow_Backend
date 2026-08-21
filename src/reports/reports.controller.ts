import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportFilterDto } from './dto/report-filter.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildContentDisposition } from '../export/export.utils';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('attendance')
  @ApiOperation({ summary: 'Báo cáo thống kê chuyên cần' })
  async getAttendanceReport(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.getAttendanceReport(filter, user);
  }

  @Get('attendance/export/csv')
  @ApiOperation({ summary: 'Xuất file CSV báo cáo chuyên cần' })
  async exportAttendanceCsv(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const csvContent = await this.reportsService.exportAttendanceReportCsv(filter, user);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="Bao_cao_chuyen_can.csv"');
    return res.send(csvContent);
  }

  @Get('assessments')
  @ApiOperation({ summary: 'Báo cáo thống kê kết quả đánh giá học sinh' })
  async getAssessmentReport(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.getAssessmentReport(filter, user);
  }

  @Get('assessments/export/csv')
  @ApiOperation({ summary: 'Xuất file CSV báo cáo đánh giá học sinh' })
  async exportAssessmentCsv(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const csvContent = await this.reportsService.exportAssessmentReportCsv(filter, user);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="Bao_cao_danh_gia.csv"');
    return res.send(csvContent);
  }

  @Get('classroom-summary/:classroomId')
  @ApiOperation({ summary: 'Báo cáo tổng hợp toàn diện lớp học (sĩ số, chuyên cần, nề nếp)' })
  async getClassroomSummary(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.getClassroomSummaryReport(classroomId, user);
  }

  @Get('classroom-summary/:classroomId/export/docx')
  @ApiOperation({ summary: 'Xuất file Word (.docx) báo cáo tổng hợp lớp học' })
  async exportClassroomSummaryDocx(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.exportClassroomSummaryDocx(classroomId, user);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="Bao_cao_tong_hop_lop_hoc.docx"');
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  }

  @Get('teaching-assignments')
  @ApiOperation({ summary: 'Báo cáo phân công chuyên môn giáo viên' })
  async getTeachingAssignments(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.getTeachingAssignmentsReport(filter, user);
  }

  @Get('student-enrollments')
  @ApiOperation({ summary: 'Báo cáo số liệu tuyển sinh và danh sách học sinh' })
  async getStudentEnrollments(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.getStudentEnrollmentReport(filter, user);
  }
}
