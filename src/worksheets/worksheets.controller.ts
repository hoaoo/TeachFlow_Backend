import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WorksheetsService } from './worksheets.service';
import { CreateWorksheetDto } from './dto/create-worksheet.dto';
import { UpdateWorksheetDto } from './dto/update-worksheet.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Worksheets')
@ApiBearerAuth()
@Controller('worksheets')
export class WorksheetsController {
  constructor(private worksheetsService: WorksheetsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách phiếu học tập' })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.worksheetsService.findAll(user.teacherId);
  }

  @Post('preview')
  @ApiOperation({ summary: 'Xem trước phiếu học tập chưa lưu (JSON render model)' })
  async previewDraft(
    @Body() dto: CreateWorksheetDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.worksheetsService.previewDraft(dto, user.teacherName);
  }

  @Get(':id/preview')
  @ApiOperation({ summary: 'Xem trước phiếu học tập đã lưu (JSON render model)' })
  async previewById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.worksheetsService.previewById(id, user.teacherId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết phiếu học tập' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.worksheetsService.findOne(id, user.teacherId);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo phiếu học tập mới' })
  async create(
    @Body() dto: CreateWorksheetDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.worksheetsService.create(dto, user.teacherId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật phiếu học tập' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWorksheetDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.worksheetsService.update(id, dto, user.teacherId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa phiếu học tập' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.worksheetsService.remove(id, user.teacherId);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Nhân bản phiếu học tập' })
  async duplicate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.worksheetsService.duplicate(id, user.teacherId);
  }
}
