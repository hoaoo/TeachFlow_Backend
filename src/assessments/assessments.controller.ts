import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AssessmentsService } from './assessments.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import {
  UpdateAssessmentDto,
  BulkStudentAssessmentDto,
  BatchSaveAssessmentScoresDto,
} from './dto/bulk-student-assessment.dto';
import { GradebookQueryDto } from './dto/gradebook-query.dto';
import { ImportGradebookScoresDto } from './dto/import-gradebook-scores.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Assessments')
@ApiBearerAuth()
@Controller('assessments')
export class AssessmentsController {
  constructor(private assessmentsService: AssessmentsService) {}

  @Get('gradebook')
  @ApiOperation({ summary: 'Lấy ma trận sổ điểm lớp học (theo lớp, môn, học kỳ)' })
  async getGradebook(
    @Query() query: GradebookQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessmentsService.getGradebook(query, user.teacherId);
  }

  @Get('gradebook/export')
  @ApiOperation({ summary: 'Xuất dữ liệu sổ điểm lớp học' })
  async exportGradebook(
    @Query() query: GradebookQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessmentsService.exportGradebook(query, user.teacherId);
  }

  @Post('gradebook/import')
  @ApiOperation({ summary: 'Import điểm số từ file/bảng Excel' })
  async importGradebookScores(
    @Body() dto: ImportGradebookScoresDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessmentsService.importGradebookScores(dto, user.teacherId);
  }

  @Get('student/:studentId/profile')
  @ApiOperation({ summary: 'Lấy hồ sơ đánh giá học tập chi tiết của học sinh' })
  async getStudentAcademicProfile(
    @Param('studentId') studentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessmentsService.getStudentAcademicProfile(studentId, user.teacherId);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách đánh giá' })
  @ApiQuery({ name: 'classroomId', required: false })
  @ApiQuery({ name: 'subjectId', required: false })
  @ApiQuery({ name: 'semester', required: false, type: Number })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('classroomId') classroomId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('semester') semester?: number,
  ) {
    return this.assessmentsService.findAll(user.teacherId, classroomId, subjectId, semester ? Number(semester) : undefined);
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
  @ApiOperation({ summary: 'Tạo đợt đánh giá / cột điểm mới' })
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

  @Put(':id/scores')
  @ApiOperation({ summary: 'Lưu điểm cho nhiều học sinh theo lô' })
  async batchSaveScores(
    @Param('id') id: string,
    @Body() dto: BatchSaveAssessmentScoresDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessmentsService.bulkUpdateStudents(id, dto, user.teacherId);
  }

  @Put(':id/students')
  @ApiOperation({ summary: 'Lưu điểm/kết quả đánh giá cho nhiều học sinh theo lô (legacy route)' })
  async bulkUpdateStudents(
    @Param('id') id: string,
    @Body() dto: BulkStudentAssessmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessmentsService.bulkUpdateStudents(id, dto, user.teacherId);
  }
}
