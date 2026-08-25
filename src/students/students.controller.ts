import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StudentsService, StudentFilterQuery } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { TransferStudentDto } from './dto/transfer-student.dto';
import { ImportStudentsDto } from './dto/import-students.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildContentDisposition } from '../export/export.utils';

@ApiTags('Students')
@ApiBearerAuth()
@Controller('students')
export class StudentsController {
  constructor(private studentsService: StudentsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách học sinh (có phân trang, tìm kiếm, lọc theo lớp/khối/năm học, sắp xếp)' })
  async findAll(
    @Query() query: StudentFilterQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.findAll(query, user.teacherId);
  }

  @Get('export/xlsx')
  @ApiOperation({ summary: 'Xuất danh sách học sinh theo bộ lọc ra file Excel (.xlsx)' })
  async exportXlsx(
    @Query() query: StudentFilterQuery,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.studentsService.exportXlsx(query, user.teacherId);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      buildContentDisposition(filename, filename),
    );
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  }

  @Get('export/excel')
  @ApiOperation({ summary: 'Xuất danh sách học sinh theo bộ lọc ra file Excel (alias)' })
  async exportExcel(
    @Query() query: StudentFilterQuery,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    return this.exportXlsx(query, user, res);
  }

  @Post('import')
  @ApiOperation({ summary: 'Import danh sách học sinh từ file/dữ liệu dạng bảng vào lớp' })
  async importStudents(
    @Body() dto: ImportStudentsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.importStudents(dto, user.teacherId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem thông tin chi tiết học sinh' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.findOne(id, user.teacherId);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo hồ sơ học sinh mới và ghi danh vào lớp' })
  async create(
    @Body() dto: CreateStudentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.create(dto, user.teacherId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật hồ sơ học sinh' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.update(id, dto, user.teacherId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Rút học sinh khỏi lớp (bảo lưu lịch sử)' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.remove(id, user.teacherId);
  }

  @Post(':id/transfer')
  @ApiOperation({ summary: 'Chuyển lớp cho học sinh' })
  async transfer(
    @Param('id') id: string,
    @Body() dto: TransferStudentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.transferStudent(id, dto, user.teacherId);
  }

  @Get(':id/profile')
  @ApiOperation({ summary: 'Student 360 profile' })
  async getProfile(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.studentsService.getProfile(id, user.teacherId);
  }

  @Get(':id/overview')
  @ApiOperation({ summary: 'Lấy tổng quan tiến độ và chỉ số học sinh' })
  async getOverview(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.getOverview(id, user.teacherId);
  }

  @Get(':id/attendance')
  @ApiOperation({ summary: 'Lấy lịch sử và thống kê chuyên cần của học sinh' })
  async getAttendance(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.getAttendance(id, user.teacherId);
  }

  @Get(':id/assessments')
  @ApiOperation({ summary: 'Lấy kết quả đánh giá của học sinh' })
  async getAssessments(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.getAssessments(id, user.teacherId);
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'Lấy danh sách nhận xét của học sinh' })
  async getComments(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.getComments(id, user.teacherId);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Thêm nhận xét cho học sinh' })
  async addComment(
    @Param('id') id: string,
    @Body() body: { content: string; classroomId?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.addComment(id, body.content, body.classroomId, user.teacherId);
  }

  @Get(':id/enrollments')
  @ApiOperation({ summary: 'Lấy lịch sử ghi danh và phân lớp của học sinh qua các năm' })
  async getEnrollments(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.getEnrollments(id, user.teacherId);
  }
}
