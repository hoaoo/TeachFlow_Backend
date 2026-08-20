import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AdminTeachersService } from './admin-teachers.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { UpdateTeacherStatusDto } from './dto/update-teacher-status.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AdminTeacherQueryDto } from './dto/admin-teacher-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Admin Teachers')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/teachers')
export class AdminTeachersController {
  constructor(private readonly adminTeachersService: AdminTeachersService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách giáo viên kèm tìm kiếm, lọc và phân trang' })
  async listTeachers(@Query() query: AdminTeacherQueryDto) {
    return this.adminTeachersService.listTeachers(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết thông tin giáo viên' })
  async getTeacher(@Param('id') id: string) {
    return this.adminTeachersService.getTeacher(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo tài khoản giáo viên mới' })
  @ApiResponse({ status: 201, description: 'Tạo tài khoản giáo viên thành công' })
  @ApiResponse({ status: 409, description: 'Email đã được sử dụng' })
  async createTeacher(
    @Body() dto: CreateTeacherDto,
    @CurrentUser() actorUser: AuthenticatedUser,
  ) {
    return this.adminTeachersService.createTeacher(dto, actorUser);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật thông tin giáo viên' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @ApiResponse({ status: 409, description: 'Email đã được sử dụng' })
  async updateTeacher(
    @Param('id') id: string,
    @Body() dto: UpdateTeacherDto,
    @CurrentUser() actorUser: AuthenticatedUser,
  ) {
    return this.adminTeachersService.updateTeacher(id, dto, actorUser);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Khóa hoặc mở khóa tài khoản giáo viên' })
  @ApiResponse({ status: 200, description: 'Thay đổi trạng thái thành công' })
  @ApiResponse({ status: 409, description: 'Không thể khóa tài khoản đang đăng nhập' })
  async updateTeacherStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTeacherStatusDto,
    @CurrentUser() actorUser: AuthenticatedUser,
  ) {
    return this.adminTeachersService.updateTeacherStatus(id, dto, actorUser);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đặt lại mật khẩu cho giáo viên và thu hồi phiên đăng nhập cũ' })
  @ApiResponse({ status: 200, description: 'Đặt lại mật khẩu thành công' })
  async resetTeacherPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() actorUser: AuthenticatedUser,
  ) {
    return this.adminTeachersService.resetTeacherPassword(id, dto, actorUser);
  }
}
