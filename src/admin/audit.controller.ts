import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuditService } from '../common/audit/audit.service';
import { AuditQueryDto } from '../common/audit/dto/audit-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Admin - Audit Logs')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('ADMIN')
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Xem nhật ký hoạt động hệ thống (Chỉ dành cho ADMIN)' })
  @ApiResponse({ status: 200, description: 'Danh sách nhật ký hệ thống' })
  async getAuditLogs(@Query() query: AuditQueryDto) {
    return this.auditService.listLogs(query);
  }
}
