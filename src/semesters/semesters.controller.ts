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
import { SemestersService } from './semesters.service';
import { CreateSemesterDto } from './dto/create-semester.dto';
import { UpdateSemesterDto } from './dto/update-semester.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Semesters')
@ApiBearerAuth()
@Controller('semesters')
export class SemestersController {
  constructor(private service: SemestersService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách học kỳ' })
  @ApiQuery({ name: 'schoolYearId', required: false, type: String, description: 'Lọc theo ID năm học' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Lọc theo trạng thái' })
  async findAll(
    @Query('schoolYearId') schoolYearId?: string,
    @Query('isActive') isActive?: string,
  ) {
    const isActiveBool =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.service.findAll({ schoolYearId, isActive: isActiveBool });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết học kỳ' })
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Tạo học kỳ mới' })
  async create(@Body() dto: CreateSemesterDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Cập nhật thông tin học kỳ' })
  async update(@Param('id') id: string, @Body() dto: UpdateSemesterDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Xóa học kỳ' })
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
