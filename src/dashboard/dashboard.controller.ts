import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy dữ liệu tổng quan trang chủ Dashboard' })
  async getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getDashboardData(user);
  }

  @Get('schedule')
  @ApiOperation({ summary: 'Lấy lịch dạy dashboard theo ngày hoặc khoảng ngày' })
  @ApiQuery({ name: 'date', required: false, description: 'Ngày cụ thể (YYYY-MM-DD)' })
  @ApiQuery({ name: 'from', required: false, description: 'Từ ngày (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: false, description: 'Đến ngày (YYYY-MM-DD)' })
  async getSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.getDashboardSchedule(user, { date, from, to });
  }
}
