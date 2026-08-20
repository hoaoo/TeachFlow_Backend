import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AssessmentsService } from './assessments.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto, BulkStudentAssessmentDto } from './dto/bulk-student-assessment.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Assessments')
@ApiBearerAuth()
@Controller('assessments')
export class AssessmentsController {
  constructor(private assessmentsService: AssessmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách đánh giá' })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.assessmentsService.findAll(user.teacherId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết đánh giá' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessmentsService.findOne(id, user.teacherId);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo đợt đánh giá mới' })
  async create(
    @Body() dto: CreateAssessmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessmentsService.create(dto, user.teacherId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật thông tin đánh giá' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAssessmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessmentsService.update(id, dto, user.teacherId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa đợt đánh giá' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessmentsService.remove(id, user.teacherId);
  }

  @Put(':id/students')
  @ApiOperation({ summary: 'Lưu điểm/kết quả đánh giá cho nhiều học sinh theo lô' })
  async bulkUpdateStudents(
    @Param('id') id: string,
    @Body() dto: BulkStudentAssessmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessmentsService.bulkUpdateStudents(id, dto, user.teacherId);
  }
}
