import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TeachingAssignmentsService } from './teaching-assignments.service';
import { CreateTeachingAssignmentDto } from './dto/create-teaching-assignment.dto';
import { UpdateTeachingAssignmentDto } from './dto/update-teaching-assignment.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Teaching Assignments')
@ApiBearerAuth()
@Controller('teaching-assignments')
export class TeachingAssignmentsController {
  constructor(private readonly assignmentsService: TeachingAssignmentsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Lấy danh sách phân công giảng dạy của giáo viên hiện tại' })
  @ApiQuery({ name: 'schoolYearId', required: false, type: String })
  async findMyAssignments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('schoolYearId') schoolYearId?: string,
  ) {
    return this.assignmentsService.findMyAssignments(user.teacherId, schoolYearId);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách phân công giảng dạy (Admin xem tất cả, Teacher xem của mình)' })
  @ApiQuery({ name: 'schoolYearId', required: false, type: String })
  @ApiQuery({ name: 'teacherId', required: false, type: String })
  @ApiQuery({ name: 'classroomId', required: false, type: String })
  @ApiQuery({ name: 'subjectId', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('schoolYearId') schoolYearId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('classroomId') classroomId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    const isActiveBool =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    const targetTeacherId = user.role === Role.ADMIN ? teacherId : user.teacherId;

    return this.assignmentsService.findAll({
      schoolYearId,
      teacherId: targetTeacherId,
      classroomId,
      subjectId,
      isActive: isActiveBool,
      search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết một phân công giảng dạy' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.assignmentsService.findOne(id, teacherId);
  }

  @Post()
  @ApiOperation({ summary: 'Khai báo / tạo phân công giảng dạy (Giáo viên tự khai báo lớp/môn)' })
  async create(
    @Body() dto: CreateTeachingAssignmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const effectiveTeacherId =
      user.role === Role.ADMIN && dto.teacherId
        ? dto.teacherId
        : user.teacherId;

    if (!effectiveTeacherId) {
      throw new BadRequestException('Không tìm thấy thông tin giáo viên cho tài khoản này');
    }

    return this.assignmentsService.create({
      ...dto,
      teacherId: effectiveTeacherId,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật phân công giảng dạy (Giáo viên cập nhật phân công của mình)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTeachingAssignmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.assignmentsService.update(id, dto, teacherId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hủy / Vô hiệu hóa phân công giảng dạy (Giáo viên hủy phân công của mình)' })
  async deactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.assignmentsService.deactivate(id, teacherId);
  }
}
