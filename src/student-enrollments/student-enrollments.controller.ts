import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { StudentEnrollmentsService } from './student-enrollments.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { TransferEnrollmentDto } from './dto/transfer-enrollment.dto';
import { WithdrawEnrollmentDto } from './dto/withdraw-enrollment.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { EnrollmentStatus, Role } from '@prisma/client';

@ApiTags('Student Enrollments')
@ApiBearerAuth()
@Controller('student-enrollments')
export class StudentEnrollmentsController {
  constructor(private readonly enrollmentsService: StudentEnrollmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách ghi danh học sinh theo năm học/lớp' })
  @ApiQuery({ name: 'schoolYearId', required: false, type: String })
  @ApiQuery({ name: 'classroomId', required: false, type: String })
  @ApiQuery({ name: 'studentId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: EnrollmentStatus })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('schoolYearId') schoolYearId?: string,
    @Query('classroomId') classroomId?: string,
    @Query('studentId') studentId?: string,
    @Query('status') status?: EnrollmentStatus,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.enrollmentsService.findAll({
      schoolYearId,
      classroomId,
      studentId,
      status,
      teacherId,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết một bản ghi ghi danh' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.enrollmentsService.findOne(id, teacherId);
  }

  @Post()
  @ApiOperation({ summary: 'Ghi danh học sinh vào lớp học' })
  async create(
    @Body() dto: CreateEnrollmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.enrollmentsService.create(dto, user.teacherId);
  }

  @Post(':id/transfer')
  @ApiOperation({ summary: 'Chuyển học sinh sang lớp học khác trong cùng năm học' })
  async transfer(
    @Param('id') id: string,
    @Body() dto: TransferEnrollmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.enrollmentsService.transfer(id, dto, user.teacherId);
  }

  @Post(':id/withdraw')
  @ApiOperation({ summary: 'Rút học sinh khỏi lớp học / Nghỉ học' })
  async withdraw(
    @Param('id') id: string,
    @Body() dto: WithdrawEnrollmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.enrollmentsService.withdraw(id, dto, user.teacherId);
  }
}
