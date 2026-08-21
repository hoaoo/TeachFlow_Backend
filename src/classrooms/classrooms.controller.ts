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
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Classes')
@ApiBearerAuth()
@Controller('classes')
export class ClassroomsController {
  constructor(private classroomsService: ClassroomsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách lớp học' })
  @ApiQuery({ name: 'schoolYearId', required: false, type: String, description: 'Lọc theo ID năm học' })
  @ApiQuery({ name: 'gradeId', required: false, type: String, description: 'Lọc theo ID khối lớp' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Lọc theo trạng thái hoạt động' })
  @ApiQuery({ name: 'keyword', required: false, type: String, description: 'Tìm kiếm theo tên hoặc mã lớp' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('schoolYearId') schoolYearId?: string,
    @Query('gradeId') gradeId?: string,
    @Query('isActive') isActive?: string,
    @Query('keyword') keyword?: string,
  ) {
    const isActiveBool =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;

    return this.classroomsService.findAll({
      teacherId,
      schoolYearId,
      gradeId,
      isActive: isActiveBool,
      keyword,
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

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa lớp học' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.classroomsService.remove(id, teacherId);
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

  @Delete(':id/students/:studentId')
  @ApiOperation({ summary: 'Xóa học sinh khỏi lớp' })
  async removeStudent(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const teacherId = user.role === Role.ADMIN ? undefined : user.teacherId;
    return this.classroomsService.removeStudent(id, studentId, teacherId);
  }
}
