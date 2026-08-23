import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ClassroomsService } from './classrooms.service';
import { CreateClassroomDto } from './dto/create-classroom.dto';
import { UpdateClassroomDto } from './dto/update-classroom.dto';
import { AddStudentToClassDto } from './dto/add-student-to-class.dto';
import { CloneClassroomDto } from './dto/clone-classroom.dto';
import { ImportStudentsDto } from './dto/import-students.dto';
import { TransferStudentDto } from './dto/transfer-student.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Classes')
@ApiBearerAuth()
@Controller('classes')
export class ClassroomsController {
  constructor(private classroomsService: ClassroomsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách lớp học (kèm KPI tổng thể)' })
  @ApiQuery({ name: 'schoolYearId', required: false, type: String, description: 'Lọc theo ID năm học' })
  @ApiQuery({ name: 'gradeId', required: false, type: String, description: 'Lọc theo ID khối lớp' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Lọc theo trạng thái (ACTIVE, COMPLETED, ALL)' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Lọc theo trạng thái hoạt động' })
  @ApiQuery({ name: 'keyword', required: false, type: String, description: 'Tìm kiếm theo tên hoặc mã lớp' })
  @ApiQuery({ name: 'sort', required: false, type: String, description: 'Sắp xếp theo (name, studentCount, attendanceRate, updatedAt)' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('schoolYearId') schoolYearId?: string,
    @Query('gradeId') gradeId?: string,
    @Query('status') status?: string,
    @Query('isActive') isActive?: string,
    @Query('keyword') keyword?: string,
    @Query('sort') sort?: string,
  ) {
    const isActiveBool =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;

    return this.classroomsService.findAll({
      teacherId,
      schoolYearId,
      gradeId,
      status,
      isActive: isActiveBool,
      keyword,
      sort,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem thông tin chi tiết lớp học' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.classroomsService.findOne(id, teacherId);
  }

  @Get(':id/subjects')
  @ApiOperation({ summary: 'Lấy các môn được cấu hình cho lớp do giáo viên hiện tại làm chủ nhiệm' })
  async getConfiguredSubjects(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classroomsService.getConfiguredSubjects(id, user.teacherId);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo lớp học mới' })
  async create(
    @Body() dto: CreateClassroomDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classroomsService.create(dto, user.teacherId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật thông tin lớp học' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateClassroomDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.classroomsService.update(id, dto, teacherId);
  }

  @Post(':id/homeroom')
  @ApiOperation({ summary: 'Đặt lớp làm lớp chủ nhiệm của giáo viên hiện tại' })
  async setAsHomeroom(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classroomsService.setAsHomeroom(id, user.teacherId);
  }

  @Delete(':id/homeroom')
  @ApiOperation({ summary: 'Bỏ phân công chủ nhiệm của giáo viên hiện tại' })
  async unsetAsHomeroom(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classroomsService.unsetAsHomeroom(id, user.teacherId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa / Lưu trữ lớp học' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.classroomsService.remove(id, teacherId);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Kết thúc lớp học / Kết thúc năm học' })
  async completeClass(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.classroomsService.completeClass(id, teacherId);
  }

  @Post(':id/clone')
  @ApiOperation({ summary: 'Nhân bản lớp học sang năm học mới' })
  async cloneClass(
    @Param('id') id: string,
    @Body() dto: CloneClassroomDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.classroomsService.cloneClass(id, dto, teacherId);
  }

  @Get(':id/dashboard')
  @ApiOperation({ summary: 'Lấy dữ liệu tổng quan KPI và lịch sử cho tab Tổng quan' })
  async getDashboard(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.classroomsService.getDashboard(id, teacherId);
  }

  @Get(':id/students')
  @ApiOperation({ summary: 'Lấy danh sách học sinh trong lớp' })
  async getStudents(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.classroomsService.getStudents(id, teacherId);
  }

  @Post(':id/students')
  @ApiOperation({ summary: 'Thêm học sinh vào lớp' })
  async addStudent(
    @Param('id') id: string,
    @Body() dto: AddStudentToClassDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.classroomsService.addStudent(id, dto, teacherId);
  }

  @Post(':id/import-students')
  @ApiOperation({ summary: 'Import danh sách học sinh từ file / dữ liệu bảng' })
  async importStudents(
    @Param('id') id: string,
    @Body() dto: ImportStudentsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.classroomsService.importStudents(id, dto, teacherId);
  }

  @Post(':id/students/:studentId/transfer')
  @ApiOperation({ summary: 'Chuyển học sinh sang lớp khác' })
  async transferStudent(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @Body() dto: TransferStudentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.classroomsService.transferStudent(id, studentId, dto, teacherId);
  }

  @Delete(':id/students/:studentId')
  @ApiOperation({ summary: 'Rút học sinh khỏi lớp học' })
  async removeStudent(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.classroomsService.removeStudent(id, studentId, teacherId);
  }

  @Get(':id/schedules')
  @ApiOperation({ summary: 'Lấy lịch dạy của lớp học' })
  async getClassSchedules(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.classroomsService.getClassSchedules(id, teacherId);
  }

  @Get(':id/attendance')
  @ApiOperation({ summary: 'Lấy lịch sử điểm danh của lớp học' })
  @ApiQuery({ name: 'range', required: false, enum: ['today', 'week', 'month', 'all'] })
  async getClassAttendance(
    @Param('id') id: string,
    @Query('range') range: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.classroomsService.getClassAttendance(id, { range }, teacherId);
  }

  @Get(':id/assessments')
  @ApiOperation({ summary: 'Lấy kết quả đánh giá học sinh của lớp học' })
  async getClassAssessments(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.classroomsService.getClassAssessments(id, teacherId);
  }

  @Get(':id/lesson-plans')
  @ApiOperation({ summary: 'Lấy danh sách giáo án của lớp học' })
  async getClassLessonPlans(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.classroomsService.getClassLessonPlans(id, teacherId);
  }
}
