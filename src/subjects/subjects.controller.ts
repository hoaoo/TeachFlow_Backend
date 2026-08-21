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
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Subjects')
@ApiBearerAuth()
@Controller('subjects')
export class SubjectsController {
  constructor(private service: SubjectsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách môn học' })
  @ApiQuery({ name: 'keyword', required: false, type: String, description: 'Tìm kiếm theo tên hoặc mã môn' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Lọc theo trạng thái hoạt động' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Lọc theo status (ACTIVE/INACTIVE)' })
  async findAll(
    @Query('keyword') keyword?: string,
    @Query('isActive') isActive?: string,
    @Query('status') status?: string,
  ) {
    const isActiveBool =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.service.findAll({ keyword, isActive: isActiveBool, status });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết môn học' })
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Tạo môn học mới' })
  async create(@Body() dto: CreateSubjectDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Cập nhật thông tin môn học' })
  async update(@Param('id') id: string, @Body() dto: UpdateSubjectDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Xóa môn học' })
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
