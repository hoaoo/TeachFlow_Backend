import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
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
import { PreviewService } from './preview.service';
import JSZip = require('jszip');

const execFileAsync = promisify(execFile);
const LEGACY_POWERPOINT_MIME = 'application/vnd.ms-powerpoint';
const OPENXML_POWERPOINT_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
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
    await fs.promises.rm(this.getResourceCacheRoot(resourceId), { recursive: true, force: true });
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
      (extension === '.ppt' && mimeType === LEGACY_POWERPOINT_MIME) ||
      (extension === '.pptx' && [OPENXML_POWERPOINT_MIME, 'application/octet-stream'].includes(mimeType));
    if (!['.ppt', '.pptx'].includes(extension) || !validMime) {
      throw new UnsupportedMediaTypeException('Định dạng này chưa hỗ trợ trình chiếu.');
    }
    if (!resource.storedFileName || path.basename(resource.storedFileName) !== resource.storedFileName) {
      throw new NotFoundException('Không tìm thấy tài liệu.');
    }

    const filePath = this.storageService.getSafeFilePath(resource.storedFileName);
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
    const isOle = header.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
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
      const raw = await fs.promises.readFile(path.join(cacheDir, CACHE_MANIFEST), 'utf8');
      const manifest = JSON.parse(raw) as PresentationManifest;
      if (
        manifest.resourceId !== resourceId ||
        manifest.fingerprint !== fingerprint ||
        !Number.isInteger(manifest.slideCount) ||
        manifest.slideCount < 1 ||
        manifest.files.length !== manifest.slideCount ||
        !manifest.files.every((file, index) => file === `slide-${String(index + 1).padStart(3, '0')}.png`)
      ) {
        return null;
      }
      const existence = await Promise.all(manifest.files.map((file) => fs.promises.access(path.join(cacheDir, file))));
      void existence;
      return manifest;
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
      await fs.promises.rm(cacheDir, { recursive: true, force: true });
      await fs.promises.rename(stagingDir, cacheDir);
      await this.removeStaleCaches(resourceId, fingerprint);
      return manifest;
    } catch (error) {
      if (error instanceof UnsupportedMediaTypeException) throw error;
      this.logger.error(`Presentation conversion failed for resource ${resourceId}`);
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
    const files: string[] = [];
    for (let index = 0; index < rendered.length; index += 1) {
      const fileName = `slide-${String(index + 1).padStart(3, '0')}.png`;
      await fs.promises.copyFile(path.join(operationDir, rendered[index]), path.join(stagingDir, fileName));
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
