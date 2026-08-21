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
import { SchoolYearsService } from './school-years.service';
import { CreateSchoolYearDto } from './dto/create-school-year.dto';
import { UpdateSchoolYearDto } from './dto/update-school-year.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('School Years')
@ApiBearerAuth()
@Controller('school-years')
export class SchoolYearsController {
  constructor(private service: SchoolYearsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách năm học' })
  @ApiQuery({ name: 'keyword', required: false, type: String, description: 'Tìm kiếm theo tên năm học' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Lọc theo trạng thái hoạt động' })
  async findAll(
    @Query('keyword') keyword?: string,
    @Query('isActive') isActive?: string,
  ) {
    const isActiveBool =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.service.findAll({ keyword, isActive: isActiveBool });
  }

  @Get('current')
  @ApiOperation({ summary: 'Lấy thông tin năm học hiện tại' })
  async getCurrent() {
    return this.service.getCurrent();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết năm học' })
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Tạo năm học mới' })
  async create(@Body() dto: CreateSchoolYearDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Cập nhật thông tin năm học' })
  async update(@Param('id') id: string, @Body() dto: UpdateSchoolYearDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/set-current')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Đặt làm năm học hiện tại' })
  async setCurrent(@Param('id') id: string) {
    return this.service.setCurrent(id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Xóa năm học' })
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
