import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage/storage.service';
import { determineResourceType, validateUploadedFile } from './resources.validator';
import { UploadResourceDto } from './dto/upload-resource.dto';
import { CreateResourceDto, UpdateResourceDto } from './dto/create-resource.dto';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class ResourcesService {
  private readonly logger = new Logger(ResourcesService.name);

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    private configService: ConfigService,
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
   * Upload real file and persist metadata
   */
  async uploadResource(
    file: Express.Multer.File,
    dto: UploadResourceDto,
    user: AuthenticatedUser,
  ) {
    const teacherId = await this.getTeacherId(user);
    // Validate file with type-specific size limit from config
    const validation = validateUploadedFile(file, undefined, undefined, this.configService);

    // Save physical file to storage
    const stored = await this.storageService.saveFile(file, validation.extension);

    const displayName = dto.name?.trim() || validation.sanitizedOriginalName;

    // Save database record
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

    return this.mapResourceResponse(resource);
  }

  /**
   * Persist an AI-generated (or extracted) binary as a TeachingResource.
   * Stores the file via StorageService; DB only keeps metadata/reference.
   */
  async saveGeneratedFile(
    user: AuthenticatedUser,
    params: {
      buffer: Buffer;
      extension: string;
      mimeType: string;
      name: string;
      description?: string;
      resourceType?: string;
    },
  ) {
    const teacherId = await this.getTeacherId(user);
    const ext = params.extension.startsWith('.') ? params.extension : `.${params.extension}`;
    const stored = await this.storageService.saveBuffer(params.buffer, ext);
    const displayName = (params.name || 'Tài nguyên AI').trim().slice(0, 120);
    const sanitizedOriginalName = `${displayName.replace(/[\/\\?%*:|"<>]/g, '_')}${ext}`.slice(0, 120);

    const resource = await this.prisma.teachingResource.create({
      data: {
        teacherId,
        name: displayName,
        title: displayName,
        originalFileName: sanitizedOriginalName,
        storedFileName: stored.storedFileName,
        storagePath: stored.storagePath,
        mimeType: params.mimeType || 'application/octet-stream',
        size: stored.size,
        resourceType: params.resourceType || determineResourceType(ext),
        description: params.description || null,
        status: 'ACTIVE',
        meta: `${this.formatFileSize(stored.size)} · ${ext.toUpperCase().replace('.', '')} · AI`,
        tone: 'teal',
      },
      include: {
        subject: true,
        grade: true,
        lesson: true,
      },
    });

    this.logger.log(
      `Generated resource saved: id=${resource.id} teacherId=${teacherId} size=${stored.size} type=${resource.resourceType}`,
    );

    return this.mapResourceResponse(resource);
  }

  /**
   * List resources with optional filters
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
    const where: any = { deletedAt: null };

    if (user.role !== 'ADMIN') {
      const teacherId = await this.getTeacherId(user);
      where.teacherId = teacherId;
    }

    if (filters?.subjectId) {
      where.subjectId = filters.subjectId;
    }
    if (filters?.gradeId) {
      where.gradeId = filters.gradeId;
    }
    if (filters?.resourceType && filters.resourceType !== 'ALL') {
      where.resourceType = filters.resourceType;
    }
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { title: { contains: filters.search, mode: 'insensitive' } },
        { originalFileName: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
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
   * Get single resource detail
   */
  async findOne(id: string, user: AuthenticatedUser) {
    const res = await this.prisma.teachingResource.findUnique({
      where: { id },
      include: {
        subject: true,
        grade: true,
        lesson: true,
      },
    });

    if (!res || res.deletedAt) {
      throw new NotFoundException('Không tìm thấy tài nguyên dạy học');
    }

    const teacherId = await this.getTeacherId(user);
    if (user.role !== 'ADMIN' && res.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập tài nguyên này');
    }

    return this.mapResourceResponse(res);
  }

  /**
   * Get physical file details for download or stream
   */
  async getFileForDownload(id: string, user: AuthenticatedUser) {
    const res = await this.prisma.teachingResource.findUnique({
      where: { id },
    });

    if (!res || res.deletedAt) {
      throw new NotFoundException('Không tìm thấy tài nguyên dạy học');
    }

    const teacherId = await this.getTeacherId(user);
    if (user.role !== 'ADMIN' && res.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền tải xuống tài nguyên này');
    }

    if (!res.storedFileName) {
      throw new NotFoundException('Tài nguyên không có tệp đính kèm trên máy chủ');
    }

    const exists = await this.storageService.fileExists(res.storedFileName);
    if (!exists) {
      throw new NotFoundException('Tệp tin vật lý không còn tồn tại trên máy chủ');
    }

    const filePath = this.storageService.getSafeFilePath(res.storedFileName);

    return {
      filePath,
      originalFileName: res.originalFileName || res.name || 'resource_file',
      mimeType: res.mimeType || 'application/octet-stream',
      size: res.size || 0,
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

    // Soft delete DB record
    await this.prisma.teachingResource.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Delete physical file from storage
    if (res.storedFileName) {
      await this.storageService.deleteFile(res.storedFileName);
    }

    return { success: true, message: 'Đã xóa tài nguyên thành công' };
  }

  private mapResourceResponse(r: any) {
    const extension = r.originalFileName ? r.originalFileName.split('.').pop()?.toUpperCase() : '';
    const formattedSize = this.formatFileSize(r.size);

    return {
      id: r.id,
      name: r.name || r.title,
      title: r.title || r.name,
      originalFileName: r.originalFileName,
      storedFileName: r.storedFileName,
      resourceType: r.resourceType || 'DOCUMENT',
      mimeType: r.mimeType,
      size: r.size,
      formattedSize,
      extension,
      subjectId: r.subjectId,
      subjectName: r.subject?.name || null,
      gradeId: r.gradeId,
      gradeName: r.grade?.name || null,
      lessonId: r.lessonId,
      lessonTitle: r.lesson?.title || null,
      subtitle: r.subtitle || `${r.subject?.name || 'Học liệu'} · ${r.grade?.name || 'Tiểu học'}`,
      description: r.description,
      status: r.status || 'ACTIVE',
      meta: r.meta || `${formattedSize} · ${extension || 'DOC'}`,
      tone: r.tone || 'teal',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
