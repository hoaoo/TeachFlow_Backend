import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TeachingAssignmentsService } from './teaching-assignments.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Teaching Assignments')
@ApiBearerAuth()
@Controller('me/teaching-assignments')
export class MeTeachingAssignmentsController {
  constructor(private readonly assignmentsService: TeachingAssignmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách phân công giảng dạy của giáo viên hiện tại (từ Token)' })
  @ApiQuery({ name: 'schoolYearId', required: false, type: String })
  async getMyAssignments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('schoolYearId') schoolYearId?: string,
  ) {
    return this.assignmentsService.findMyAssignments(user.teacherId, schoolYearId);
  }
}
