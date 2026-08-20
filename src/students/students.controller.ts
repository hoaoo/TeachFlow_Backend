import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Students')
@ApiBearerAuth()
@Controller('students')
export class StudentsController {
  constructor(private studentsService: StudentsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách học sinh (có phân trang, tìm kiếm, lọc)' })
  async findAll(
    @Query() query: PaginationQueryDto & { classId?: string; status?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.findAll(query, user.teacherId);
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
  @ApiOperation({ summary: 'Tạo hồ sơ học sinh mới' })
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
  @ApiOperation({ summary: 'Xóa học sinh' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.remove(id, user.teacherId);
  }

  @Get(':id/overview')
  @ApiOperation({ summary: 'Lấy tổng quan tiến độ học sinh' })
  async getOverview(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.getOverview(id, user.teacherId);
  }

  @Get(':id/attendance')
  @ApiOperation({ summary: 'Lấy lịch sử chuyên cần của học sinh' })
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
}
