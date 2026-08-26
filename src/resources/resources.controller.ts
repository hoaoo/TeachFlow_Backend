import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
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
import {
  PresignUploadDto,
  PresignedUploadResponseDto,
  CompleteUploadDto,
  ResourceSignedUrlDto,
} from './dto/presign-upload.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildContentDisposition, sanitizeFilename } from '../export/export.utils';

@ApiTags('Resources')
@Controller('resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Post('presign-upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Tạo URL tải lên trực tiếp (Presigned upload cho Mobile/Web)' })
  @ApiResponse({ status: 200, type: PresignedUploadResponseDto, description: 'Thông tin presigned upload' })
  async presignUpload(
    @Body() dto: PresignUploadDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PresignedUploadResponseDto> {
    return this.resourcesService.presignUpload(dto, user);
  }

  @Post('complete-upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Hoàn tất ghi nhận metadata sau khi upload trực tiếp thành công' })
  @ApiResponse({ status: 201, description: 'Tài nguyên đã được lưu vào hệ thống' })
  async completeUpload(
    @Body() dto: CompleteUploadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.resourcesService.completeUpload(dto, user);
  }

  @Get(':id/presign-url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Lấy URL xem/tải tạm thời có chữ ký (Signed GET URL cho Mobile/Web)' })
  @ApiResponse({ status: 200, type: ResourceSignedUrlDto, description: 'Signed URL có thời hạn' })
  async getSignedUrl(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('ttl') ttl?: number,
  ): Promise<ResourceSignedUrlDto> {
    const ttlSeconds = ttl ? Number(ttl) : 3600;
    return this.resourcesService.getSignedAccessUrl(id, user, ttlSeconds);
  }

  @Public()
  @Get('stream/:fileKey')
  @ApiOperation({ summary: 'Truy cập/stream trực tiếp file bằng signed token (không yêu cầu Bearer header trong thẻ media)' })
  async streamFile(
    @Param('fileKey') fileKey: string,
    @Query('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const fileInfo = await this.resourcesService.getSafeFileForStream(fileKey, token);
    const stat = fs.statSync(fileInfo.filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const ext = fileKey.split('.').pop() || 'dat';
    const baseWithoutExt = fileKey.replace(/\.[^.]+$/, '');
    const { asciiFilename, utf8Filename } = sanitizeFilename(baseWithoutExt, ext);

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(fileInfo.filePath, { start, end });

      res.writeHead(HttpStatus.PARTIAL_CONTENT, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': buildContentDisposition(asciiFilename, utf8Filename, 'inline'),
      });
      return file.pipe(res);
    } else {
      res.writeHead(HttpStatus.OK, {
        'Content-Length': fileSize,
        'Content-Type': 'application/octet-stream',
        'Accept-Ranges': 'bytes',
        'Content-Disposition': buildContentDisposition(asciiFilename, utf8Filename, 'inline'),
      });
      return fs.createReadStream(fileInfo.filePath).pipe(res);
    }
  }

  @Public()
  @Put('direct-upload/:fileKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Endpoint tải lên trực tiếp tập tin nhị phân' })
  async handleDirectUpload(
    @Param('fileKey') fileKey: string,
    @Query('token') token: string,
    @Req() req: Request,
  ) {
    const result = await this.resourcesService.handleDirectUpload(fileKey, token, req);
    return { success: true, size: result.size, fileKey };
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Tải lên tập tin học liệu multipart (PDF, Word, PPTX, Excel, Hình ảnh, Video)' })
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Xem chi tiết thông tin tài nguyên' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.resourcesService.findOne(id, user);
  }

  @Get(':id/download')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Tải xuống tập tin tài nguyên đính kèm' })
  async downloadFile(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const fileInfo = await this.resourcesService.getFileForDownload(id, user);

    const ext = fileInfo.originalFileName.split('.').pop() || 'dat';
    const baseWithoutExt = fileInfo.originalFileName.replace(/\.[^.]+$/, '');
    const { asciiFilename, utf8Filename } = sanitizeFilename(baseWithoutExt, ext);

    res.setHeader('Content-Type', fileInfo.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', buildContentDisposition(asciiFilename, utf8Filename, 'attachment'));
    res.setHeader('Accept-Ranges', 'bytes');
    if (fileInfo.size) {
      res.setHeader('Content-Length', fileInfo.size);
    }

    const stream = fs.createReadStream(fileInfo.filePath);
    return stream.pipe(res);
  }

  @Get(':id/file')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Xem trực tiếp tập tin (inline preview)' })
  async viewFile(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const fileInfo = await this.resourcesService.getFileForDownload(id, user);

    const ext = fileInfo.originalFileName.split('.').pop() || 'dat';
    const baseWithoutExt = fileInfo.originalFileName.replace(/\.[^.]+$/, '');
    const { asciiFilename, utf8Filename } = sanitizeFilename(baseWithoutExt, ext);

    res.setHeader('Content-Type', fileInfo.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', buildContentDisposition(asciiFilename, utf8Filename, 'inline'));
    res.setHeader('Accept-Ranges', 'bytes');
    if (fileInfo.size) {
      res.setHeader('Content-Length', fileInfo.size);
    }

    const stream = fs.createReadStream(fileInfo.filePath);
    return stream.pipe(res);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Tạo metadata tài nguyên mới (legacy)' })
  async create(
    @Body() dto: CreateResourceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.resourcesService.create(dto, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cập nhật thông tin tài nguyên' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateResourceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.resourcesService.update(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Xóa tài nguyên và tập tin vật lý' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.resourcesService.remove(id, user);
  }
}
