import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Lấy danh sách lịch dạy / kế hoạch dạy học' })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.teachingPlansService.findAll(user.teacherId);
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
