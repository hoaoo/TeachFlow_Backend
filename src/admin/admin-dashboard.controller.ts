import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AdminTeachersService } from './admin-teachers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Admin Dashboard')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly adminTeachersService: AdminTeachersService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy dữ liệu tổng quan quản trị hệ thống' })
  @ApiResponse({ status: 200, description: 'Thông số hệ thống dành cho Admin' })
  async getDashboardStats() {
    return this.adminTeachersService.getSystemStats();
  }
}
