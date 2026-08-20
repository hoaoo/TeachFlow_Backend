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
  UseInterceptors,
  UploadedFile,
  UseGuards,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import * as fs from 'fs';
import { ResourcesService } from './resources.service';
import { UploadResourceDto } from './dto/upload-resource.dto';
import { CreateResourceDto, UpdateResourceDto } from './dto/create-resource.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildContentDisposition, sanitizeFilename } from '../export/export.utils';

@ApiTags('Resources')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Tải lên tập tin học liệu thật (PDF, Word, PPTX, Excel, Hình ảnh, Video)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'Tập tin tải lên' },
        name: { type: 'string', description: 'Tên hiển thị' },
        subjectId: { type: 'string', description: 'Mã môn học' },
        gradeId: { type: 'string', description: 'Mã khối lớp' },
        lessonId: { type: 'string', description: 'Mã bài học' },
        description: { type: 'string', description: 'Mô tả học liệu' },
        tone: { type: 'string', description: 'Màu sắc card' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadResourceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.resourcesService.uploadResource(file, dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách tài nguyên dạy học kèm bộ lọc' })
  @ApiQuery({ name: 'subjectId', required: false })
  @ApiQuery({ name: 'gradeId', required: false })
  @ApiQuery({ name: 'resourceType', required: false })
  @ApiQuery({ name: 'search', required: false })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('subjectId') subjectId?: string,
    @Query('gradeId') gradeId?: string,
    @Query('resourceType') resourceType?: string,
    @Query('search') search?: string,
  ) {
    return this.resourcesService.findAll(user, {
      subjectId,
      gradeId,
      resourceType,
      search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết thông tin tài nguyên' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.resourcesService.findOne(id, user);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Tải xuống tập tin tài nguyên đính kèm' })
  async downloadFile(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const fileInfo = await this.resourcesService.getFileForDownload(id, user);

    const ext = (fileInfo.originalFileName.split('.').pop() || 'dat') as any;
    const baseWithoutExt = fileInfo.originalFileName.replace(/\.[^.]+$/, '');
    const { asciiFilename, utf8Filename } = sanitizeFilename(baseWithoutExt, ext);

    res.setHeader('Content-Type', fileInfo.mimeType);
    res.setHeader('Content-Disposition', buildContentDisposition(asciiFilename, utf8Filename));
    if (fileInfo.size) {
      res.setHeader('Content-Length', fileInfo.size);
    }

    const stream = fs.createReadStream(fileInfo.filePath);
    return stream.pipe(res);
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Xem trực tiếp tập tin (inline preview)' })
  async viewFile(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const fileInfo = await this.resourcesService.getFileForDownload(id, user);

    const ext = (fileInfo.originalFileName.split('.').pop() || 'dat') as any;
    const baseWithoutExt = fileInfo.originalFileName.replace(/\.[^.]+$/, '');
    const { asciiFilename, utf8Filename } = sanitizeFilename(baseWithoutExt, ext);

    res.setHeader('Content-Type', fileInfo.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(utf8Filename)}`);
    if (fileInfo.size) {
      res.setHeader('Content-Length', fileInfo.size);
    }

    const stream = fs.createReadStream(fileInfo.filePath);
    return stream.pipe(res);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo metadata tài nguyên mới (legacy)' })
  async create(
    @Body() dto: CreateResourceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.resourcesService.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật thông tin tài nguyên' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateResourceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.resourcesService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa tài nguyên và tập tin vật lý' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.resourcesService.remove(id, user);
  }
}
