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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LessonPlansService } from './lesson-plans.service';
import { CreateLessonPlanDto } from './dto/create-lesson-plan.dto';
import { UpdateLessonPlanDto } from './dto/update-lesson-plan.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ReorderActivitiesDto } from './dto/reorder-activities.dto';
import { SaveActivityToLibraryDto } from './dto/save-to-library.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Lesson Plans')
@ApiBearerAuth()
@Controller('lesson-plans')
export class LessonPlansController {
  constructor(private lessonPlansService: LessonPlansService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách giáo án (hỗ trợ tìm kiếm và lọc)' })
  @ApiQuery({ name: 'classroomId', required: false, description: 'Lọc theo lớp' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Lọc theo môn' })
  @ApiQuery({ name: 'status', required: false, description: 'Lọc theo trạng thái (DRAFT, COMPLETED, TAUGHT)' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Từ ngày (YYYY-MM-DD)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Đến ngày (YYYY-MM-DD)' })
  @ApiQuery({ name: 'search', required: false, description: 'Tìm kiếm tên bài, môn, lớp...' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('classroomId') classroomId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('search') search?: string,
  ) {
    return this.lessonPlansService.findAll(user.teacherId, {
      classroomId,
      subjectId,
      status,
      dateFrom,
      dateTo,
      search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết giáo án' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonPlansService.findOne(id, user.teacherId);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo giáo án mới' })
  async create(
    @Body() dto: CreateLessonPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonPlansService.create(dto, user.teacherId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật giáo án (có optimistic concurrency qua version)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLessonPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonPlansService.update(id, dto, user.teacherId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa giáo án' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonPlansService.remove(id, user.teacherId);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Nhân bản giáo án' })
  async duplicate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() options?: { classroomId?: string; date?: string; title?: string },
  ) {
    return this.lessonPlansService.duplicate(id, user.teacherId, options);
  }

  @Post(':id/activities')
  @ApiOperation({ summary: 'Thêm hoạt động vào giáo án' })
  async addActivity(
    @Param('id') id: string,
    @Body() dto: CreateActivityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonPlansService.addActivity(id, dto, user.teacherId);
  }

  @Patch(':id/activities/:activityId')
  @ApiOperation({ summary: 'Cập nhật hoạt động trong giáo án' })
  async updateActivity(
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() dto: UpdateActivityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonPlansService.updateActivity(id, activityId, dto, user.teacherId);
  }

  @Delete(':id/activities/:activityId')
  @ApiOperation({ summary: 'Xóa hoạt động khỏi giáo án' })
  async removeActivity(
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonPlansService.removeActivity(id, activityId, user.teacherId);
  }

  @Put(':id/activities/reorder')
  @ApiOperation({ summary: 'Sắp xếp lại thứ tự các hoạt động' })
  async reorderActivities(
    @Param('id') id: string,
    @Body() dto: ReorderActivitiesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonPlansService.reorderActivities(id, dto, user.teacherId);
  }

  @Post(':id/activities/:activityId/save-to-library')
  @ApiOperation({ summary: 'Lưu hoạt động vào thư viện cá nhân' })
  async saveActivityToLibrary(
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() dto: SaveActivityToLibraryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonPlansService.saveActivityToLibrary(id, activityId, dto, user.teacherId);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Lấy lịch sử phiên bản giáo án' })
  async getVersions(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonPlansService.getVersions(id, user.teacherId);
  }

  @Post(':id/restore/:versionId')
  @ApiOperation({ summary: 'Khôi phục giáo án về một phiên bản trước' })
  async restoreVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonPlansService.restoreVersion(id, versionId, user.teacherId);
  }

  @Post(':id/schedules/:scheduleId')
  @ApiOperation({ summary: 'Liên kết giáo án với một tiết trong lịch dạy' })
  async linkSchedule(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonPlansService.linkSchedule(id, scheduleId, user.teacherId);
  }

  @Delete(':id/schedules/:scheduleId')
  @ApiOperation({ summary: 'Gỡ liên kết giáo án khỏi một tiết trong lịch dạy' })
  async unlinkSchedule(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonPlansService.unlinkSchedule(id, scheduleId, user.teacherId);
  }

  @Get(':id/resources')
  @ApiOperation({ summary: 'Lấy danh sách tài nguyên đính kèm của giáo án' })
  async getAttachedResources(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonPlansService.getAttachedResources(id, user.teacherId);
  }

  @Post(':id/resources/:resourceId')
  @ApiOperation({ summary: 'Đính kèm tài nguyên vào giáo án' })
  async attachResource(
    @Param('id') id: string,
    @Param('resourceId') resourceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonPlansService.attachResource(id, resourceId, user.teacherId);
  }

  @Delete(':id/resources/:resourceId')
  @ApiOperation({ summary: 'Gỡ tài nguyên khỏi giáo án' })
  async detachResource(
    @Param('id') id: string,
    @Param('resourceId') resourceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonPlansService.detachResource(id, resourceId, user.teacherId);
  }
}
