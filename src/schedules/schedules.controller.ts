import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { DuplicateScheduleDto } from './dto/duplicate-schedule.dto';
import { UpdateScheduleStatusDto } from './dto/update-status.dto';
import { LinkLessonPlanDto } from './dto/link-lesson-plan.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Schedules')
@ApiBearerAuth()
@Controller('schedules')
export class SchedulesController {
  constructor(private schedulesService: SchedulesService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách lịch dạy của giáo viên hiện tại' })
  @ApiQuery({ name: 'classroomId', required: false, description: 'Lọc theo lớp học' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Lọc theo môn học' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Từ ngày (YYYY-MM-DD)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Đến ngày (YYYY-MM-DD)' })
  @ApiQuery({ name: 'status', required: false, description: 'Lọc theo trạng thái (PLANNED, IN_PROGRESS, TAUGHT, CANCELLED)' })
  @ApiQuery({ name: 'search', required: false, description: 'Tìm kiếm theo bài dạy, môn, lớp...' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('classroomId') classroomId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.schedulesService.findAll(user.teacherId, {
      classroomId,
      subjectId,
      dateFrom,
      dateTo,
      status,
      search,
    });
  }

  @Get('available-subjects')
  @ApiOperation({ summary: 'Lấy môn có thể lên lịch theo lớp và teaching mode của giáo viên hiện tại' })
  @ApiQuery({ name: 'classroomId', required: true })
  getAvailableSubjects(
    @Query('classroomId') classroomId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedulesService.getAvailableSubjects(classroomId, user.teacherId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết một tiết dạy theo lịch' })
  @ApiResponse({ status: 200, description: 'Chi tiết lịch dạy' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lịch dạy' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.schedulesService.findOne(id, user.teacherId);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo mới một tiết dạy theo lịch (hỗ trợ lịch lặp)' })
  @ApiResponse({ status: 201, description: 'Tạo lịch dạy thành công' })
  @ApiResponse({ status: 409, description: 'Trùng lịch dạy' })
  create(
    @Body() dto: CreateScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedulesService.create(dto, user.teacherId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật tiết dạy theo lịch (hỗ trợ cập nhật chuỗi lặp)' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @ApiResponse({ status: 409, description: 'Trùng lịch dạy' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedulesService.update(id, dto, user.teacherId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa một tiết dạy khỏi lịch (hỗ trợ xóa chuỗi lặp)' })
  @ApiQuery({ name: 'recurrenceScope', required: false, enum: ['THIS_ONLY', 'THIS_AND_FUTURE', 'ALL'] })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('recurrenceScope') recurrenceScope?: 'THIS_ONLY' | 'THIS_AND_FUTURE' | 'ALL',
  ) {
    return this.schedulesService.remove(id, user.teacherId, recurrenceScope);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Nhân bản một tiết dạy sang ngày/giờ mới' })
  @ApiResponse({ status: 201, description: 'Nhân bản thành công' })
  @ApiResponse({ status: 409, description: 'Trùng lịch dạy' })
  duplicate(
    @Param('id') id: string,
    @Body() dto: DuplicateScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedulesService.duplicate(id, dto, user.teacherId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Cập nhật trạng thái tiết dạy (bắt đầu/hoàn thành/hủy)' })
  @ApiResponse({ status: 200, description: 'Cập nhật trạng thái thành công' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedulesService.updateStatus(id, dto, user.teacherId);
  }

  @Post(':id/lesson-plan')
  @ApiOperation({ summary: 'Gắn giáo án vào tiết dạy' })
  @ApiResponse({ status: 200, description: 'Gắn giáo án thành công' })
  linkLessonPlan(
    @Param('id') id: string,
    @Body() dto: LinkLessonPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedulesService.linkLessonPlan(id, dto, user.teacherId);
  }

  @Delete(':id/lesson-plan')
  @ApiOperation({ summary: 'Gỡ liên kết giáo án khỏi tiết dạy' })
  @ApiResponse({ status: 200, description: 'Gỡ liên kết thành công' })
  unlinkLessonPlan(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedulesService.unlinkLessonPlan(id, user.teacherId);
  }

  @Get(':id/attendance')
  @ApiOperation({ summary: 'Lấy thông tin điểm danh của tiết dạy' })
  @ApiResponse({ status: 200, description: 'Thông tin điểm danh' })
  getAttendance(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedulesService.getScheduleAttendance(id, user.teacherId);
  }
}
