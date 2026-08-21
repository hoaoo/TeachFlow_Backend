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
  @ApiQuery({ name: 'status', required: false, description: 'Lọc theo trạng thái (PLANNED, TAUGHT, CANCELLED)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('classroomId') classroomId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: string,
  ) {
    return this.schedulesService.findAll(user.teacherId, {
      classroomId,
      subjectId,
      dateFrom,
      dateTo,
      status,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết một tiết dạy theo lịch' })
  @ApiResponse({ status: 200, description: 'Chi tiết lịch dạy' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lịch dạy' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.schedulesService.findOne(id, user.teacherId);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo mới một tiết dạy theo lịch' })
  @ApiResponse({ status: 201, description: 'Tạo lịch dạy thành công' })
  @ApiResponse({ status: 409, description: 'Trùng lịch dạy' })
  create(
    @Body() dto: CreateScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedulesService.create(dto, user.teacherId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật tiết dạy theo lịch' })
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
  @ApiOperation({ summary: 'Xóa một tiết dạy khỏi lịch' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.schedulesService.remove(id, user.teacherId);
  }
}
