import {
  Controller,
  Get,
  Put,
  Query,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { SaveAttendanceDto } from './dto/save-attendance.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy thông tin điểm danh theo lớp và ngày' })
  async getAttendance(
    @Query('classId') classId: string,
    @Query('date') date: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.getAttendance(classId, date, user.teacherId);
  }

  @Put()
  @ApiOperation({ summary: 'Lưu điểm danh (transaction nguyên tử)' })
  async saveAttendance(
    @Body() dto: SaveAttendanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.saveAttendance(dto, user.teacherId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Lấy lịch sử các phiên điểm danh' })
  async getHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getHistory(user.teacherId);
  }
}
