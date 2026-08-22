import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { SaveAttendanceDto } from './dto/save-attendance.dto';
import { SaveScheduleAttendanceDto } from './dto/save-schedule-attendance.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy thông tin điểm danh theo lớp và ngày (Homeroom/Daily)' })
  @ApiQuery({ name: 'classId', required: false })
  @ApiQuery({ name: 'date', required: false })
  async getAttendance(
    @Query('classId') classId: string,
    @Query('date') date: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.getAttendance(classId, date, user.teacherId);
  }

  @Put()
  @ApiOperation({ summary: 'Lưu điểm danh theo lớp và ngày (Homeroom/Daily)' })
  async saveAttendance(
    @Body() dto: SaveAttendanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.saveAttendance(dto, user.teacherId);
  }

  @Get('schedules/:scheduleId')
  @ApiOperation({ summary: 'Lấy thông tin điểm danh theo tiết dạy (Schedule)' })
  async getScheduleAttendance(
    @Param('scheduleId') scheduleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.getScheduleAttendance(scheduleId, user.teacherId);
  }

  @Put('schedules/:scheduleId')
  @ApiOperation({ summary: 'Lưu điểm danh theo tiết dạy (Schedule) trong database transaction' })
  async saveScheduleAttendance(
    @Param('scheduleId') scheduleId: string,
    @Body() dto: SaveScheduleAttendanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.saveScheduleAttendance(scheduleId, dto, user.teacherId);
  }

  @Post('schedules/:scheduleId')
  @ApiOperation({ summary: 'Lưu điểm danh theo tiết dạy (Schedule) (Alias for PUT)' })
  async saveScheduleAttendancePost(
    @Param('scheduleId') scheduleId: string,
    @Body() dto: SaveScheduleAttendanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.saveScheduleAttendance(scheduleId, dto, user.teacherId);
  }

  @Get('students/:studentId/summary')
  @ApiOperation({ summary: 'Lấy thống kê chuyên cần và lịch sử điểm danh của học sinh' })
  async getStudentAttendanceSummary(
    @Param('studentId') studentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.getStudentAttendanceSummary(studentId, user.teacherId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Lấy thống kê chuyên cần theo lớp và khoảng thời gian' })
  @ApiQuery({ name: 'classId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async getAttendanceStats(
    @CurrentUser() user: AuthenticatedUser,
    @Query('classId') classId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.attendanceService.getAttendanceStats(user.teacherId, {
      classId,
      dateFrom,
      dateTo,
    });
  }

  @Get('history')
  @ApiOperation({ summary: 'Lấy lịch sử các phiên điểm danh' })
  async getHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getHistory(user.teacherId);
  }
}
