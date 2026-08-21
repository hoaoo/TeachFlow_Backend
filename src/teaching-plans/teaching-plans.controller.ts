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

@ApiTags('Teaching Plans')
@ApiBearerAuth()
@Controller('teaching-plans')
export class TeachingPlansController {
  constructor(private teachingPlansService: TeachingPlansService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách kế hoạch dạy học của giáo viên (lọc theo lớp, môn, năm học)' })
  @ApiQuery({ name: 'classroomId', required: false, type: String })
  @ApiQuery({ name: 'subjectId', required: false, type: String })
  @ApiQuery({ name: 'schoolYearId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('classroomId') classroomId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('schoolYearId') schoolYearId?: string,
    @Query('status') status?: string,
  ) {
    return this.teachingPlansService.findAll(user.teacherId, {
      classroomId,
      subjectId,
      schoolYearId,
      status,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết kế hoạch dạy học' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teachingPlansService.findOne(id, user.teacherId);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo kế hoạch dạy học mới' })
  async create(
    @Body() dto: CreateTeachingPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teachingPlansService.create(dto, user.teacherId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật kế hoạch dạy học' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTeachingPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teachingPlansService.update(id, dto, user.teacherId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa kế hoạch dạy học' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teachingPlansService.remove(id, user.teacherId);
  }
}
