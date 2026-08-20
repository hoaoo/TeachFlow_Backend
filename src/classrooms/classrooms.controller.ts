import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClassroomsService } from './classrooms.service';
import { CreateClassroomDto } from './dto/create-classroom.dto';
import { UpdateClassroomDto } from './dto/update-classroom.dto';
import { AddStudentToClassDto } from './dto/add-student-to-class.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Classes')
@ApiBearerAuth()
@Controller('classes')
export class ClassroomsController {
  constructor(private classroomsService: ClassroomsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách lớp học của giáo viên hiện tại' })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.classroomsService.findAll(user.teacherId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem thông tin chi tiết lớp học' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classroomsService.findOne(id, user.teacherId);
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
    return this.classroomsService.update(id, dto, user.teacherId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa lớp học' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classroomsService.remove(id, user.teacherId);
  }

  @Get(':id/students')
  @ApiOperation({ summary: 'Lấy danh sách học sinh trong lớp' })
  async getStudents(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classroomsService.getStudents(id, user.teacherId);
  }

  @Post(':id/students')
  @ApiOperation({ summary: 'Thêm học sinh vào lớp' })
  async addStudent(
    @Param('id') id: string,
    @Body() dto: AddStudentToClassDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classroomsService.addStudent(id, dto, user.teacherId);
  }

  @Delete(':id/students/:studentId')
  @ApiOperation({ summary: 'Xóa học sinh khỏi lớp' })
  async removeStudent(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classroomsService.removeStudent(id, studentId, user.teacherId);
  }
}
