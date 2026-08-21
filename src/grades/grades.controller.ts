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
import { GradesService } from './grades.service';
import { CreateGradeDto } from './dto/create-grade.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Grades')
@ApiBearerAuth()
@Controller('grades')
export class GradesController {
  constructor(private service: GradesService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách khối lớp' })
  @ApiQuery({ name: 'keyword', required: false, type: String, description: 'Tìm kiếm theo tên hoặc mã khối' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Lọc theo trạng thái hoạt động' })
  async findAll(
    @Query('keyword') keyword?: string,
    @Query('isActive') isActive?: string,
  ) {
    const isActiveBool =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.service.findAll({ keyword, isActive: isActiveBool });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết khối lớp' })
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Tạo khối lớp mới' })
  async create(@Body() dto: CreateGradeDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Cập nhật thông tin khối lớp' })
  async update(@Param('id') id: string, @Body() dto: UpdateGradeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Xóa khối lớp' })
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
