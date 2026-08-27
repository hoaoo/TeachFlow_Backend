import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage/storage.service';
import { determineResourceType, validateUploadedFile, MIME_TYPE_MAP } from './resources.validator';
import { UploadResourceDto } from './dto/upload-resource.dto';
import { CreateResourceDto, UpdateResourceDto } from './dto/create-resource.dto';
import {
  PresignUploadDto,
  PresignedUploadResponseDto,
  CompleteUploadDto,
  ResourceSignedUrlDto,
} from './dto/presign-upload.dto';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PreviewService } from './preview.service';

@Injectable()
export class ResourcesService {
  private readonly logger = new Logger(ResourcesService.name);

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    private configService: ConfigService,
    private previewService: PreviewService,
  ) {}

  private async getTeacherId(user: AuthenticatedUser): Promise<string> {
    if (user.teacherId) {
      return user.teacherId;
    }
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: user.userId },
      select: { id: true },
    });
    if (!teacher) {
      throw new ForbiddenException('Không tìm thấy thông tin giáo viên cho tài khoản này');
    }
    return teacher.id;
  }

  private formatFileSize(bytes?: number | null): string {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * 1. Presign Upload URL for Mobile & Web direct-to-storage upload
   */
  async presignUpload(
    dto: PresignUploadDto,
    user: AuthenticatedUser,
  ): Promise<PresignedUploadResponseDto> {
    const teacherId = await this.getTeacherId(user);
    return this.storageService.generatePresignedUpload(dto, teacherId);
  }

  /**
   * 2. Complete Upload: create database record after direct upload succeeds
   */
  async completeUpload(
    dto: CompleteUploadDto,
    user: AuthenticatedUser,
  ) {
    const teacherId = await this.getTeacherId(user);
    const storedFileName = path.basename(dto.fileKey);

    const exists = await this.storageService.fileExists(storedFileName);
    if (!exists) {
      throw new BadRequestException('Tập tin chưa được tải lên hoặc khóa tệp không hợp lệ');
    }

    const stats = await this.storageService.getFileStats(storedFileName);
    const size = dto.size || stats?.size || 0;
    const ext = path.extname(storedFileName).toLowerCase();
    const resourceType = determineResourceType(ext);

    const resource = await this.prisma.teachingResource.create({
      data: {
        teacherId,
        name: dto.name.trim(),
        title: dto.name.trim(),
        originalFileName: dto.name.trim().includes('.') ? dto.name.trim() : `${dto.name.trim()}${ext}`,
        storedFileName,
        storagePath: this.storageService.getSafeFilePath(storedFileName),
        mimeType: dto.mimeType || 'application/octet-stream',
        size,
        resourceType,
        subjectId: dto.subjectId || null,
        gradeId: dto.gradeId || null,
        lessonId: dto.lessonId || null,
        description: dto.description || null,
        status: 'ACTIVE',
        meta: `${this.formatFileSize(size)} · ${ext.toUpperCase().replace('.', '')}`,
        tone: dto.tone || 'teal',
      },
      include: {
        subject: true,
        grade: true,
        lesson: true,
      },
    });

    this.logger.log(
      `Resource complete-upload: id=${resource.id} teacherId=${teacherId} size=${size} type=${resourceType}`,
    );

    if (['.ppt', '.pptx'].includes(ext)) {
      this.previewService.processResourcePreview(
        resource.id,
        resource.storagePath || this.storageService.getSafeFilePath(storedFileName),
        resource.originalFileName || resource.name,
      ).catch((err) => this.logger.error(`Background preview error: ${err.message}`));
    }

    return this.mapResourceResponse(resource);
  }

  /**
   * 3. Generate temporary signed GET URL for secure mobile/web viewing & streaming
   */
  async getSignedAccessUrl(
    id: string,
    user: AuthenticatedUser,
    ttlSeconds = 3600,
  ): Promise<ResourceSignedUrlDto> {
    const teacherId = await this.getTeacherId(user);
    const resource = await this.prisma.teachingResource.findUnique({
      where: { id },
    });

    if (!resource || resource.deletedAt) {
      throw new NotFoundException('Không tìm thấy tài nguyên');
    }

    if (user.role !== 'ADMIN' && resource.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập tài nguyên này');
    }

    if (!resource.storedFileName) {
      throw new NotFoundException('Tài nguyên không có tập tin đính kèm');
    }

    const { token, expiresAt } = this.storageService.generateSignedAccessToken(
      resource.storedFileName,
      teacherId,
      ttlSeconds,
    );

    const host = this.configService.get<string>('API_BASE_URL') || '';
    const url = `${host}/api/resources/stream/${resource.storedFileName}?token=${token}`;

    return {
      url,
      expiresAt: expiresAt.toISOString(),
      fileName: resource.originalFileName || resource.name,
      mimeType: resource.mimeType || 'application/octet-stream',
      size: resource.size || 0,
    };
  }

  /**
   * 4. Verify signed access token and return file info for streaming
   */
  async getSafeFileForStream(storedFileName: string, token: string) {
    const verified = this.storageService.verifySignedAccessToken(storedFileName, token);
    if (!verified.valid) {
      throw new UnauthorizedException('Chữ ký truy cập không hợp lệ hoặc đã hết hạn');
    }

    const exists = await this.storageService.fileExists(storedFileName);
    if (!exists) {
      throw new NotFoundException('Tập tin không tồn tại trên hệ thống lưu trữ');
    }

    const filePath = this.storageService.getSafeFilePath(storedFileName);
    const stats = await this.storageService.getFileStats(storedFileName);

    const resource = await this.prisma.teachingResource.findFirst({
      where: {
        storedFileName,
        deletedAt: null,
      },
      select: {
        mimeType: true,
        originalFileName: true,
        name: true,
      },
    });

    const ext = path.extname(storedFileName).toLowerCase();
    const fallbackMime = (ext && (MIME_TYPE_MAP as any)[ext]?.[0]) || 'application/octet-stream';

    return {
      filePath,
      size: stats?.size || 0,
      teacherId: verified.teacherId,
      mimeType: resource?.mimeType || fallbackMime,
      originalFileName: resource?.originalFileName || resource?.name || storedFileName,
    };
  }

  /**
   * Direct Upload handler: save direct upload chunk
   */
  async handleDirectUpload(
    storedFileName: string,
    token: string,
    stream: NodeJS.ReadableStream,
  ) {
    const verified = this.storageService.verifyUploadToken(storedFileName, token);
    if (!verified.valid) {
      throw new UnauthorizedException('Mã xác thực tải lên trực tiếp không hợp lệ hoặc đã hết hạn');
    }

    return this.storageService.saveStreamToFile(storedFileName, stream);
  }

  /**
   * Upload real file via multipart form (standard web upload)
   */
  async uploadResource(
    file: Express.Multer.File,
    dto: UploadResourceDto,
    user: AuthenticatedUser,
  ) {
    const teacherId = await this.getTeacherId(user);
    const validation = validateUploadedFile(file, undefined, undefined, this.configService);
    const stored = await this.storageService.saveFile(file, validation.extension);

    const displayName = dto.name?.trim() || validation.sanitizedOriginalName;

    const resource = await this.prisma.teachingResource.create({
      data: {
        teacherId,
        name: displayName,
        title: displayName,
        originalFileName: validation.sanitizedOriginalName,
        storedFileName: stored.storedFileName,
        storagePath: stored.storagePath,
        mimeType: file.mimetype || 'application/octet-stream',
        size: stored.size,
        resourceType: validation.resourceType,
        subjectId: dto.subjectId || null,
        gradeId: dto.gradeId || null,
        lessonId: dto.lessonId || null,
        description: dto.description || null,
        status: 'ACTIVE',
        meta: `${this.formatFileSize(stored.size)} · ${validation.extension.toUpperCase().replace('.', '')}`,
        tone: dto.tone || 'teal',
      },
      include: {
        subject: true,
        grade: true,
        lesson: true,
      },
    });

    this.logger.log(
      `Resource uploaded: id=${resource.id} teacherId=${teacherId} size=${stored.size} type=${validation.resourceType}`,
    );

    if (['.ppt', '.pptx'].includes(validation.extension.toLowerCase())) {
      this.previewService.processResourcePreview(
        resource.id,
        stored.storagePath,
        validation.sanitizedOriginalName,
      ).catch((err) => this.logger.error(`Background preview error: ${err.message}`));
    }

    return this.mapResourceResponse(resource);
  }

  /**
   * Persist an AI-generated (or extracted) binary as a TeachingResource.
   */
  async saveGeneratedBinary(
    buffer: Buffer,
    dto: {
      title: string;
      originalFileName: string;
      mimeType: string;
      subjectId?: string;
      gradeId?: string;
      lessonId?: string;
      description?: string;
      tone?: string;
    },
    user: AuthenticatedUser,
  ) {
    const teacherId = await this.getTeacherId(user);
    const ext = path.extname(dto.originalFileName) || '.dat';
    const stored = await this.storageService.saveBuffer(buffer, ext);
    const resourceType = determineResourceType(ext);

    const resource = await this.prisma.teachingResource.create({
      data: {
        teacherId,
        name: dto.title.trim(),
        title: dto.title.trim(),
        originalFileName: dto.originalFileName,
        storedFileName: stored.storedFileName,
        storagePath: stored.storagePath,
        mimeType: dto.mimeType,
        size: stored.size,
        resourceType,
        subjectId: dto.subjectId || null,
        gradeId: dto.gradeId || null,
        lessonId: dto.lessonId || null,
        description: dto.description || null,
        status: 'ACTIVE',
        meta: `${this.formatFileSize(stored.size)} · ${ext.toUpperCase().replace('.', '')}`,
        tone: dto.tone || 'violet',
      },
      include: {
        subject: true,
        grade: true,
        lesson: true,
      },
    });

    return this.mapResourceResponse(resource);
  }

  /**
   * Alias for Image AI and other internal modules
   */
  async saveGeneratedFile(
    user: AuthenticatedUser,
    opts: {
      buffer: Buffer;
      extension: string;
      mimeType: string;
      name: string;
      description?: string;
      resourceType?: string;
    },
  ) {
    const ext = opts.extension.startsWith('.') ? opts.extension : `.${opts.extension}`;
    return this.saveGeneratedBinary(
      opts.buffer,
      {
        title: opts.name,
        originalFileName: `${opts.name}${ext}`,
        mimeType: opts.mimeType,
        description: opts.description,
      },
      user,
    );
  }

  /**
   * Find all resources with filtering and teacher ownership isolation (IDOR proof)
   */
  async findAll(
    user: AuthenticatedUser,
    filters?: {
      subjectId?: string;
      gradeId?: string;
      resourceType?: string;
      search?: string;
    },
  ) {
    const teacherId = await this.getTeacherId(user);
    const where: any = {
      teacherId,
      deletedAt: null,
    };

    if (filters?.subjectId) {
      where.subjectId = filters.subjectId;
    }

    if (filters?.gradeId) {
      where.gradeId = filters.gradeId;
    }

    if (filters?.resourceType) {
      where.resourceType = filters.resourceType;
    }

    if (filters?.search) {
      const s = filters.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { title: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
      ];
    }

    const list = await this.prisma.teachingResource.findMany({
      where,
      include: {
        subject: true,
        grade: true,
        lesson: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return list.map((r) => this.mapResourceResponse(r));
  }

  /**
   * Find single resource with strict ownership check
   */
  async findOne(id: string, user: AuthenticatedUser) {
    const teacherId = await this.getTeacherId(user);
    const resource = await this.prisma.teachingResource.findUnique({
      where: { id },
      include: {
        subject: true,
        grade: true,
        lesson: true,
      },
    });

    if (!resource || resource.deletedAt) {
      throw new NotFoundException('Không tìm thấy tài nguyên học liệu');
    }

    if (user.role !== 'ADMIN' && resource.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập tài nguyên này');
    }

    return this.mapResourceResponse(resource);
  }

  /**
   * Get physical file path and metadata for download/inline preview
   */
  async getFileForDownload(id: string, user: AuthenticatedUser) {
    const resource = await this.findOne(id, user);

    if (!resource.storedFileName) {
      throw new NotFoundException('Tài nguyên này không có tập tin vật lý đính kèm');
    }

    const exists = await this.storageService.fileExists(resource.storedFileName);
    if (!exists) {
      this.logger.error(`File missing on disk for resource ${id}: ${resource.storedFileName}`);
      throw new NotFoundException('Tập tin không tồn tại trên hệ thống lưu trữ');
    }

    const filePath = this.storageService.getSafeFilePath(resource.storedFileName);

    return {
      filePath,
      originalFileName: resource.originalFileName || resource.name,
      mimeType: resource.mimeType,
      size: resource.size,
    };
  }

  /**
   * Create metadata-only resource (backward compatibility)
   */
  async create(dto: CreateResourceDto, user: AuthenticatedUser) {
    const teacherId = await this.getTeacherId(user);
    const res = await this.prisma.teachingResource.create({
      data: {
        teacherId,
        name: dto.title,
        title: dto.title,
        subtitle: dto.subtitle || 'Lớp 4A · Năm học 2026–2027',
        status: dto.status || 'ACTIVE',
        meta: dto.meta || 'Vừa cập nhật',
        tone: dto.tone || 'teal',
        resourceType: dto.resourceType || 'DOCUMENT',
        fileUrl: dto.fileUrl,
        externalUrl: dto.externalUrl,
        description: dto.description,
      },
    });

    return this.mapResourceResponse(res);
  }

  /**
   * Update resource metadata
   */
  async update(id: string, dto: UpdateResourceDto, user: AuthenticatedUser) {
    await this.findOne(id, user);

    const updated = await this.prisma.teachingResource.update({
      where: { id },
      data: {
        name: dto.title || undefined,
        title: dto.title || undefined,
        subtitle: dto.subtitle || undefined,
        status: dto.status || undefined,
        meta: dto.meta || undefined,
        tone: dto.tone || undefined,
        description: dto.description || undefined,
      },
      include: {
        subject: true,
        grade: true,
        lesson: true,
      },
    });

    return this.mapResourceResponse(updated);
  }

  /**
   * Get preview file path (converted PDF for PPTX, or original for other media)
   */
  async getPreviewFile(id: string, user: AuthenticatedUser) {
    const resource = await this.findOne(id, user);

    if (resource.previewStatus === 'READY' && resource.previewStorageKey) {
      const exists = await this.storageService.fileExists(resource.previewStorageKey);
      if (exists) {
        const filePath = this.storageService.getSafeFilePath(resource.previewStorageKey);
        const stats = await this.storageService.getFileStats(resource.previewStorageKey);
        const baseName = (resource.originalFileName || resource.name).replace(/\.[^.]+$/, '');
        return {
          filePath,
          originalFileName: `${baseName}_preview.pdf`,
          mimeType: 'application/pdf',
          size: stats?.size || 0,
        };
      }
    }

    if (resource.previewStatus === 'PENDING') {
      throw new BadRequestException('Bản xem trước đang được khởi tạo, vui lòng thử lại sau giây lát');
    }

    // Fallback to original file
    return this.getFileForDownload(id, user);
  }

  /**
   * Soft delete database record and delete physical file
   */
  async remove(id: string, user: AuthenticatedUser) {
    const res = await this.prisma.teachingResource.findUnique({
      where: { id },
    });

    if (!res || res.deletedAt) {
      throw new NotFoundException('Không tìm thấy tài nguyên');
    }

    const teacherId = await this.getTeacherId(user);
    if (user.role !== 'ADMIN' && res.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền xóa tài nguyên này');
    }

    await this.prisma.teachingResource.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    if (res.storedFileName) {
      await this.storageService.deleteFile(res.storedFileName);
    }
    if (res.previewStorageKey) {
      await this.storageService.deleteFile(res.previewStorageKey);
    }

    return { success: true, message: 'Đã xóa tài nguyên thành công' };
  }

  private mapResourceResponse(r: any) {
    const extension = r.originalFileName ? r.originalFileName.split('.').pop()?.toUpperCase() : '';
    const formattedSize = this.formatFileSize(r.size);

    return {
      id: r.id,
      name: r.name || r.title || 'Tài nguyên chưa đặt tên',
      title: r.title || r.name || 'Tài nguyên chưa đặt tên',
      originalFileName: r.originalFileName || null,
      storedFileName: r.storedFileName || null,
      resourceType: r.resourceType || 'DOCUMENT',
      mimeType: r.mimeType || null,
      size: r.size || 0,
      formattedSize,
      extension,
      subjectId: r.subjectId || null,
      subjectName: r.subject?.name || null,
      gradeId: r.gradeId || null,
      gradeName: r.grade?.name || null,
      lessonId: r.lessonId || null,
      lessonTitle: r.lesson?.title || null,
      subtitle: r.subtitle || `${r.subject?.name || 'Học liệu'} · ${r.grade?.name || 'Tiểu học'}`,
      description: r.description || null,
      status: r.status || 'ACTIVE',
      meta: r.meta || `${formattedSize} · ${extension || 'DOC'}`,
      tone: r.tone || 'teal',
      previewStatus: r.previewStatus || 'NONE',
      previewStorageKey: r.previewStorageKey || null,
      previewMimeType: r.previewMimeType || null,
      previewGeneratedAt: r.previewGeneratedAt || null,
      previewError: r.previewError || null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
