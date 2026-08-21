import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TeachingPlansService } from './teaching-plans.service';
import { CreateTeachingPlanDto } from './dto/create-teaching-plan.dto';
import { UpdateTeachingPlanDto } from './dto/update-teaching-plan.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Teaching Plans (Schedule)')
@ApiBearerAuth()
@Controller('teaching-plans')
export class TeachingPlansController {
  constructor(private teachingPlansService: TeachingPlansService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách lịch dạy của giáo viên (có thể lọc theo lớp, môn, ngày)' })
  @ApiQuery({ name: 'classroomId', required: false, type: String })
  @ApiQuery({ name: 'subjectId', required: false, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'status', required: false, type: String })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('classroomId') classroomId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: string,
  ) {
    return this.teachingPlansService.findAll(user.teacherId, {
      classroomId,
      subjectId,
      dateFrom,
      dateTo,
      status,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết lịch dạy' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teachingPlansService.findOne(id, user.teacherId);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo lịch dạy mới (giáo viên tự lên lịch)' })
  async create(
    @Body() dto: CreateTeachingPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teachingPlansService.create(dto, user.teacherId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật lịch dạy' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTeachingPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teachingPlansService.update(id, dto, user.teacherId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa / Hủy lịch dạy' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teachingPlansService.remove(id, user.teacherId);
  }
}
