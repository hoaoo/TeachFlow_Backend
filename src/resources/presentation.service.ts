import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage/storage.service';
import { ObjectStorageService } from './storage/object-storage.service';
import { PreviewService } from './preview.service';
import JSZip = require('jszip');

const execFileAsync = promisify(execFile);
const LEGACY_POWERPOINT_MIME = 'application/vnd.ms-powerpoint';
const OPENXML_POWERPOINT_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const ALLOWED_PPTX_MIMES = new Set([
  OPENXML_POWERPOINT_MIME,
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint.presentation.macroenabled.12',
]);
const ALLOWED_PPT_MIMES = new Set([
  LEGACY_POWERPOINT_MIME,
  'application/octet-stream',
  'application/x-mspowerpoint',
  'application/mspowerpoint',
  'application/powerpoint',
  'application/vnd.ms-powerpoint',
]);
const RESOURCE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CACHE_MANIFEST = 'manifest.json';
const CONVERSION_TIMEOUT_MS = 90_000;

interface PresentationManifest {
  resourceId: string;
  fingerprint: string;
  slideCount: number;
  files: string[];
}

export interface PresentationMetadata {
  resourceId: string;
  title: string;
  slideCount: number;
  slides: Array<{ index: number; url: string }>;
}

@Injectable()
export class PresentationService {
  private readonly logger = new Logger(PresentationService.name);
  private readonly inFlight = new Map<
    string,
    { fingerprint: string; promise: Promise<PresentationManifest> }
  >();
  private readonly presentationRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
    private readonly previewService: PreviewService,
    @Optional() private readonly objectStorage?: ObjectStorageService,
  ) {
    this.presentationRoot = path.join(this.storageService.getUploadDir(), 'presentations');
  }

  async getPresentation(resourceId: string, user: AuthenticatedUser): Promise<PresentationMetadata> {
    const resource = await this.getAuthorizedResource(resourceId, user);
    const source = await this.getValidatedSource(resource);
    const fingerprint = this.createFingerprint(resource, source.stats);
    const manifest = await this.getOrCreateManifest(resourceId, fingerprint, source.filePath);

    return {
      resourceId,
      title: resource.title || resource.name,
      slideCount: manifest.slideCount,
      slides: manifest.files.map((_, index) => ({
        index: index + 1,
        url: `/resources/${resourceId}/presentation/slides/${index + 1}`,
      })),
    };
  }

  async getSlide(resourceId: string, slideIndex: number, user: AuthenticatedUser) {
    if (!Number.isInteger(slideIndex) || slideIndex < 1) {
      throw new NotFoundException('Không tìm thấy trang trình chiếu.');
    }

    const resource = await this.getAuthorizedResource(resourceId, user);
    const source = await this.getValidatedSource(resource);
    const fingerprint = this.createFingerprint(resource, source.stats);
    const manifest = await this.getOrCreateManifest(resourceId, fingerprint, source.filePath);
    const fileName = manifest.files[slideIndex - 1];
    if (!fileName) {
      throw new NotFoundException('Không tìm thấy trang trình chiếu.');
    }

    const cacheDir = this.getCacheDir(resourceId, fingerprint);
    const filePath = path.resolve(cacheDir, fileName);
    if (!filePath.startsWith(`${path.resolve(cacheDir)}${path.sep}`) || !fs.existsSync(filePath)) {
      throw new NotFoundException('Không tìm thấy trang trình chiếu.');
    }

    return { filePath, size: (await fs.promises.stat(filePath)).size, mimeType: 'image/png' };
  }

  async deletePresentationCache(resourceId: string): Promise<void> {
    if (!RESOURCE_ID_PATTERN.test(resourceId)) return;
    await fs.promises.rm(this.getResourceCacheRoot(resourceId), { recursive: true, force: true }).catch(() => undefined);
    if (this.objectStorage?.isS3Configured()) {
      await this.objectStorage.deletePrefix(`presentations/${resourceId}`).catch(() => undefined);
    }
  }

  private async getAuthorizedResource(resourceId: string, user: AuthenticatedUser) {
    if (!RESOURCE_ID_PATTERN.test(resourceId)) {
      throw new NotFoundException('Không tìm thấy tài liệu.');
    }

    const resource = await this.prisma.teachingResource.findUnique({ where: { id: resourceId } });
    if (!resource || resource.deletedAt) {
      throw new NotFoundException('Không tìm thấy tài liệu.');
    }

    let teacherId = user.teacherId;
    if (user.role !== 'ADMIN' && !teacherId) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { userId: user.userId },
        select: { id: true },
      });
      teacherId = teacher?.id;
    }
    if (user.role !== 'ADMIN' && resource.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền trình chiếu tài liệu này.');
    }

    return resource;
  }

  private async getValidatedSource(resource: {
    storedFileName: string | null;
    originalFileName: string | null;
    mimeType: string | null;
  }) {
    const originalName = resource.originalFileName || resource.storedFileName || '';
    const extension = path.extname(originalName).toLowerCase();
    const mimeType = (resource.mimeType || '').toLowerCase();
    const validMime =
      (extension === '.ppt' && (!mimeType || ALLOWED_PPT_MIMES.has(mimeType))) ||
      (extension === '.pptx' && (!mimeType || ALLOWED_PPTX_MIMES.has(mimeType)));
    if (!['.ppt', '.pptx'].includes(extension) || !validMime) {
      throw new UnsupportedMediaTypeException('Định dạng này chưa hỗ trợ trình chiếu.');
    }
    if (!resource.storedFileName || path.basename(resource.storedFileName) !== resource.storedFileName) {
      throw new NotFoundException('Không tìm thấy tài liệu.');
    }

    const filePath = typeof this.storageService.ensureLocalFile === 'function'
      ? await this.storageService.ensureLocalFile(resource.storedFileName)
      : this.storageService.getSafeFilePath(resource.storedFileName);
    let stats: fs.Stats;
    let header: Buffer;
    try {
      stats = await fs.promises.stat(filePath);
      const handle = await fs.promises.open(filePath, 'r');
      try {
        header = Buffer.alloc(8);
        await handle.read(header, 0, header.length, 0);
      } finally {
        await handle.close();
      }
    } catch {
      throw new NotFoundException('Không tìm thấy tài liệu.');
    }

    const isZip = header[0] === 0x50 && header[1] === 0x4b;
    const isOle = header[0] === 0xd0 && header[1] === 0xcf && header[2] === 0x11 && header[3] === 0xe0;
    if ((extension === '.pptx' && !isZip) || (extension === '.ppt' && !isOle)) {
      throw new UnsupportedMediaTypeException('Định dạng này chưa hỗ trợ trình chiếu.');
    }
    return { filePath, stats };
  }

  private createFingerprint(resource: { storedFileName: string | null; updatedAt: Date }, stats: fs.Stats): string {
    return crypto
      .createHash('sha256')
      .update(`${resource.storedFileName}:${stats.size}:${stats.mtimeMs}:${resource.updatedAt.toISOString()}`)
      .digest('hex')
      .slice(0, 24);
  }

  private async getOrCreateManifest(resourceId: string, fingerprint: string, sourcePath: string) {
    const cached = await this.readManifest(resourceId, fingerprint);
    if (cached) return cached;

    const existing = this.inFlight.get(resourceId);
    if (existing) {
      if (existing.fingerprint === fingerprint) return existing.promise;
      await existing.promise.catch(() => undefined);
      return this.getOrCreateManifest(resourceId, fingerprint, sourcePath);
    }

    const task = this.generatePresentation(resourceId, fingerprint, sourcePath).finally(() => {
      this.inFlight.delete(resourceId);
    });
    this.inFlight.set(resourceId, { fingerprint, promise: task });
    return task;
  }

  private async readManifest(resourceId: string, fingerprint: string): Promise<PresentationManifest | null> {
    const cacheDir = this.getCacheDir(resourceId, fingerprint);
    try {
      if (fs.existsSync(path.join(cacheDir, CACHE_MANIFEST))) {
        const raw = await fs.promises.readFile(path.join(cacheDir, CACHE_MANIFEST), 'utf8');
        const manifest = JSON.parse(raw) as PresentationManifest;
        if (
          manifest.resourceId === resourceId &&
          manifest.fingerprint === fingerprint &&
          Number.isInteger(manifest.slideCount) &&
          manifest.slideCount >= 1 &&
          manifest.files.length === manifest.slideCount &&
          manifest.files.every((file, index) => file === `slide-${String(index + 1).padStart(3, '0')}.png`)
        ) {
          const filesExist = manifest.files.every((file) => fs.existsSync(path.join(cacheDir, file)));
          if (filesExist) {
            return manifest;
          }
        }
      }

      // If missing on local disk, check if cached in object storage
      if (this.objectStorage?.isS3Configured()) {
        const s3ManifestKey = `presentations/${resourceId}/${fingerprint}/${CACHE_MANIFEST}`;
        const existsInS3 = await this.objectStorage.objectExists(s3ManifestKey);
        if (existsInS3) {
          const manifestBuffer = await this.objectStorage.getObjectBuffer(s3ManifestKey);
          const manifest = JSON.parse(manifestBuffer.toString('utf8')) as PresentationManifest;
          if (
            manifest.resourceId === resourceId &&
            manifest.fingerprint === fingerprint &&
            Number.isInteger(manifest.slideCount) &&
            manifest.slideCount >= 1 &&
            manifest.files.length === manifest.slideCount
          ) {
            await fs.promises.mkdir(cacheDir, { recursive: true });
            for (const file of manifest.files) {
              const slideKey = `presentations/${resourceId}/${fingerprint}/${file}`;
              const slideBuf = await this.objectStorage.getObjectBuffer(slideKey);
              await fs.promises.writeFile(path.join(cacheDir, file), slideBuf);
            }
            await fs.promises.writeFile(path.join(cacheDir, CACHE_MANIFEST), manifestBuffer);
            this.logger.log(`Restored presentation slides from object storage for resource ${resourceId}`);
            return manifest;
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private async generatePresentation(resourceId: string, fingerprint: string, sourcePath: string) {
    const cacheDir = this.getCacheDir(resourceId, fingerprint);
    const resourceRoot = this.getResourceCacheRoot(resourceId);
    const operationDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'teachflow-presentation-'));
    const stagingDir = path.join(resourceRoot, `.staging-${crypto.randomUUID()}`);

    try {
      await fs.promises.mkdir(resourceRoot, { recursive: true });
      await fs.promises.mkdir(stagingDir, { recursive: true });
      await this.validatePowerPointStructure(sourcePath);
      const files = await this.convertToSlides(sourcePath, operationDir, stagingDir);
      if (files.length === 0) throw new Error('No slides generated');

      const manifest: PresentationManifest = {
        resourceId,
        fingerprint,
        slideCount: files.length,
        files,
      };
      await fs.promises.writeFile(path.join(stagingDir, CACHE_MANIFEST), JSON.stringify(manifest), 'utf8');

      // Sync generated slides to ObjectStorage if S3 configured
      if (this.objectStorage?.isS3Configured()) {
        try {
          const s3Prefix = `presentations/${resourceId}/${fingerprint}`;
          for (const file of files) {
            const buf = await fs.promises.readFile(path.join(stagingDir, file));
            await this.objectStorage.putObject({
              key: `${s3Prefix}/${file}`,
              body: buf,
              contentType: 'image/png',
            });
          }
          const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf8');
          await this.objectStorage.putObject({
            key: `${s3Prefix}/${CACHE_MANIFEST}`,
            body: manifestBuf,
            contentType: 'application/json',
          });
        } catch (s3Err: any) {
          this.logger.warn(`Failed to sync presentation slides to object storage: ${s3Err?.message}`);
        }
      }

      await fs.promises.rm(cacheDir, { recursive: true, force: true });
      await fs.promises.rename(stagingDir, cacheDir);
      await this.removeStaleCaches(resourceId, fingerprint);

      if (typeof this.prisma?.teachingResource?.update === 'function') {
        await this.prisma.teachingResource.update({
          where: { id: resourceId },
          data: {
            previewStatus: 'READY',
            previewError: null,
          },
        }).catch(() => undefined);
      }

      return manifest;
    } catch (error) {
      if (error instanceof UnsupportedMediaTypeException) throw error;
      this.logger.error(`Presentation conversion failed for resource ${resourceId}: ${(error as any)?.message}`);
      if (typeof this.prisma?.teachingResource?.update === 'function') {
        await this.prisma.teachingResource.update({
          where: { id: resourceId },
          data: {
            previewStatus: 'FAILED',
            previewError: (error as any)?.message || 'Không thể chuẩn bị bản trình chiếu PowerPoint.',
          },
        }).catch(() => undefined);
      }
      throw new InternalServerErrorException('Không thể chuẩn bị bản trình chiếu.');
    } finally {
      await Promise.all([
        fs.promises.rm(operationDir, { recursive: true, force: true }),
        fs.promises.rm(stagingDir, { recursive: true, force: true }),
      ]).catch(() => undefined);
    }
  }

  private async validatePowerPointStructure(sourcePath: string): Promise<void> {
    if (path.extname(sourcePath).toLowerCase() !== '.pptx') return;
    try {
      const archive = await JSZip.loadAsync(await fs.promises.readFile(sourcePath));
      if (!archive.file('[Content_Types].xml') || !archive.file('ppt/presentation.xml')) {
        throw new Error('Missing PowerPoint OpenXML parts');
      }
    } catch {
      throw new UnsupportedMediaTypeException('Định dạng này chưa hỗ trợ trình chiếu.');
    }
  }

  private async validatePngSlide(filePath: string): Promise<void> {
    const stat = await fs.promises.stat(filePath);
    if (stat.size < 24) {
      throw new Error('Tệp hình ảnh slide không đầy đủ hoặc rỗng');
    }
    const handle = await fs.promises.open(filePath, 'r');
    try {
      const header = Buffer.alloc(24);
      await handle.read(header, 0, 24, 0);
      const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      for (let i = 0; i < 8; i++) {
        if (header[i] !== pngSignature[i]) {
          throw new Error('Định dạng ảnh slide không hợp lệ');
        }
      }
      const chunkType = header.toString('ascii', 12, 16);
      if (chunkType !== 'IHDR') {
        throw new Error('Cấu trúc ảnh slide không hợp lệ');
      }
      const width = header.readUInt32BE(16);
      const height = header.readUInt32BE(20);
      if (width <= 0 || height <= 0) {
        throw new Error('Kích thước ảnh slide không hợp lệ');
      }
    } finally {
      await handle.close();
    }
  }

  private async convertToSlides(sourcePath: string, operationDir: string, stagingDir: string): Promise<string[]> {
    const pdfTool = this.configService.get<string>('PDFTOPPM_PATH') || 'pdftoppm';
    const pdfPath = await this.previewService.convertPowerPointToPdf(sourcePath, operationDir);
    const renderPrefix = path.join(operationDir, 'rendered-slide');
    await execFileAsync(
      pdfTool,
      ['-png', '-r', '144', pdfPath, renderPrefix],
      { timeout: CONVERSION_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
    );

    const rendered = (await fs.promises.readdir(operationDir))
      .filter((file) => /^rendered-slide-\d+\.png$/i.test(file))
      .sort((a, b) => Number(a.match(/(\d+)\.png$/i)?.[1]) - Number(b.match(/(\d+)\.png$/i)?.[1]));

    if (rendered.length === 0) {
      throw new Error('Không thể tạo trang trình chiếu từ tệp PowerPoint.');
    }

    const files: string[] = [];
    for (let index = 0; index < rendered.length; index += 1) {
      const srcFile = path.join(operationDir, rendered[index]);
      await this.validatePngSlide(srcFile);

      const fileName = `slide-${String(index + 1).padStart(3, '0')}.png`;
      await fs.promises.copyFile(srcFile, path.join(stagingDir, fileName));
      files.push(fileName);
    }
    return files;
  }

  private async removeStaleCaches(resourceId: string, currentFingerprint: string): Promise<void> {
    const root = this.getResourceCacheRoot(resourceId);
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name !== currentFingerprint && !entry.name.startsWith('.staging-'))
        .map((entry) => fs.promises.rm(path.join(root, entry.name), { recursive: true, force: true })),
    );
  }

  private getResourceCacheRoot(resourceId: string): string {
    if (!RESOURCE_ID_PATTERN.test(resourceId)) throw new Error('Invalid resource id');
    return path.join(this.presentationRoot, resourceId);
  }

  private getCacheDir(resourceId: string, fingerprint: string): string {
    if (!/^[0-9a-f]{24}$/.test(fingerprint)) throw new Error('Invalid presentation fingerprint');
    return path.join(this.getResourceCacheRoot(resourceId), fingerprint);
  }
}
