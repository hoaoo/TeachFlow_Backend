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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ActivityLibraryService } from './activity-library.service';
import { CreateLibraryActivityDto } from './dto/create-activity.dto';
import { UpdateLibraryActivityDto } from './dto/update-activity.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Activity Library')
@ApiBearerAuth()
@Controller('activities')
export class ActivityLibraryController {
  constructor(private activityLibraryService: ActivityLibraryService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách hoạt động từ thư viện' })
  async findAll(
    @Query('subject') subject?: string,
    @Query('grade') grade?: string,
    @Query('type') type?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.activityLibraryService.findAll({ subject, grade, type, keyword });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết hoạt động' })
  async findOne(@Param('id') id: string) {
    return this.activityLibraryService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo hoạt động mới vào thư viện' })
  async create(
    @Body() dto: CreateLibraryActivityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.activityLibraryService.create(dto, user.teacherId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật hoạt động' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLibraryActivityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.activityLibraryService.update(id, dto, user.teacherId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa hoạt động khỏi thư viện' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.activityLibraryService.remove(id, user.teacherId);
  }

  @Post(':id/add-to-lesson-plan')
  @ApiOperation({ summary: 'Chèn hoạt động vào giáo án' })
  async addToLessonPlan(
    @Param('id') id: string,
    @Body('lessonPlanId') lessonPlanId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.activityLibraryService.addToLessonPlan(id, lessonPlanId, user.teacherId);
  }
}
