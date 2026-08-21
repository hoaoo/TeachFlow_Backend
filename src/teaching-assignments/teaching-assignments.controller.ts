import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TeachingAssignmentsService } from './teaching-assignments.service';
import { CreateTeachingContextDto } from './dto/create-teaching-assignment.dto';
import { UpdateTeachingContextDto } from './dto/update-teaching-assignment.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Teaching Context (Teacher self-declaration)')
@ApiBearerAuth()
@Controller('teaching-assignments')
export class TeachingAssignmentsController {
  constructor(private readonly assignmentsService: TeachingAssignmentsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Lấy danh sách lớp/môn đang dạy của giáo viên hiện tại (từ Token)' })
  @ApiQuery({ name: 'schoolYearId', required: false, type: String })
  async findMyAssignments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('schoolYearId') schoolYearId?: string,
  ) {
    return this.assignmentsService.findMyAssignments(user.teacherId, schoolYearId);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách lớp/môn đang dạy của giáo viên đang đăng nhập' })
  @ApiQuery({ name: 'schoolYearId', required: false, type: String })
  @ApiQuery({ name: 'classroomId', required: false, type: String })
  @ApiQuery({ name: 'subjectId', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('schoolYearId') schoolYearId?: string,
    @Query('classroomId') classroomId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    // Admin does not have a teaching context — reject to prevent ERP usage
    if (user.role === Role.ADMIN) {
      throw new ForbiddenException('Quản trị viên không có ngữ cảnh giảng dạy. Chỉ giáo viên mới có thể truy cập danh sách môn/lớp đang dạy của mình.');
    }

    const isActiveBool =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;

    return this.assignmentsService.findAll({
      schoolYearId,
      teacherId: user.teacherId, // Always scoped to current authenticated teacher
      classroomId,
      subjectId,
      isActive: isActiveBool,
      search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết một ngữ cảnh giảng dạy (chỉ của chính giáo viên)' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role === Role.ADMIN) {
      throw new ForbiddenException('Quản trị viên không có quyền truy cập ngữ cảnh giảng dạy của giáo viên.');
    }
    return this.assignmentsService.findOne(id, user.teacherId);
  }

  @Post()
  @ApiOperation({ summary: 'Giáo viên tự khai báo lớp/môn đang dạy (teaching context)' })
  async create(
    @Body() dto: CreateTeachingContextDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role === Role.ADMIN) {
      throw new ForbiddenException('Quản trị viên không thể khai báo ngữ cảnh giảng dạy cho giáo viên. Giáo viên tự khai báo lớp/môn của mình.');
    }

    if (!user.teacherId) {
      throw new BadRequestException('Không tìm thấy thông tin giáo viên cho tài khoản này');
    }

    // teacherId is always derived from JWT — never from request body
    return this.assignmentsService.create({
      ...dto,
      teacherId: user.teacherId,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Giáo viên cập nhật ngữ cảnh giảng dạy của chính mình' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTeachingContextDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role === Role.ADMIN) {
      throw new ForbiddenException('Quản trị viên không có quyền cập nhật ngữ cảnh giảng dạy của giáo viên.');
    }
    return this.assignmentsService.update(id, dto, user.teacherId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Giáo viên hủy khai báo ngữ cảnh giảng dạy của chính mình' })
  async deactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role === Role.ADMIN) {
      throw new ForbiddenException('Quản trị viên không có quyền hủy ngữ cảnh giảng dạy của giáo viên.');
    }
    return this.assignmentsService.deactivate(id, user.teacherId);
  }
}
