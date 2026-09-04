import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { pathToFileURL } from 'url';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage/storage.service';

const execFileAsync = promisify(execFile);

@Injectable()
export class PreviewService {
  private readonly logger = new Logger(PreviewService.name);

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    private configService: ConfigService,
  ) {}

  private findLibreOfficeBinary(): string | null {
    const candidates = [
      process.env.LIBREOFFICE_PATH,
      'soffice',
      'libreoffice',
      '/usr/bin/libreoffice',
      '/usr/bin/soffice',
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    ].filter(Boolean) as string[];

    for (const bin of candidates) {
      try {
        if (path.isAbsolute(bin)) {
          if (fs.existsSync(bin)) return bin;
        } else {
          return bin; // Rely on PATH resolution
        }
      } catch {}
    }
    return null;
  }

  async convertPowerPointToPdf(originalFilePath: string, outputDir: string): Promise<string> {
    const binary = this.findLibreOfficeBinary();
    if (!binary) throw new Error('LibreOffice is not configured');
    const profileDir = path.join(outputDir, 'libreoffice-profile');
    await fs.promises.mkdir(profileDir, { recursive: true });

    await execFileAsync(
      binary,
      [
        '--headless',
        '--nologo',
        '--nodefault',
        '--nofirststartwizard',
        `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
        '--convert-to',
        'pdf',
        '--outdir',
        outputDir,
        originalFilePath,
      ],
      { timeout: 90000, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
    );

    const pdfName = (await fs.promises.readdir(outputDir)).find((file) => file.toLowerCase().endsWith('.pdf'));
    if (!pdfName) throw new Error('LibreOffice did not produce a PDF');
    return path.join(outputDir, pdfName);
  }

  /**
   * Process preview generation asynchronously in background
   */
  async processResourcePreview(resourceId: string, originalFilePath: string, originalFileName?: string): Promise<void> {
    const ext = path.extname(originalFilePath || originalFileName || '').toLowerCase();
    const isPpt = ['.ppt', '.pptx'].includes(ext);

    if (!isPpt) {
      return;
    }

    try {
      await this.prisma.teachingResource.update({
        where: { id: resourceId },
        data: { previewStatus: 'PENDING', previewError: null },
      });

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teachflow-preview-'));
      const binary = this.findLibreOfficeBinary();

      try {
        let pdfBuffer: Buffer | null = null;

        if (!binary) {
          throw new Error('LibreOffice chưa được cài đặt hoặc cấu hình trên hệ thống');
        }

        this.logger.log(`Attempting LibreOffice conversion for resource ${resourceId} using ${binary}`);
        // Use execFile with explicit arguments array to prevent any shell injection
        const convertedPdfPath = await this.convertPowerPointToPdf(originalFilePath, tempDir);
        pdfBuffer = await fs.promises.readFile(convertedPdfPath);

        if (!pdfBuffer || pdfBuffer.length === 0) {
          throw new Error('Tệp PDF được tạo ra từ PowerPoint bị rỗng');
        }

        const previewKey = `preview_${resourceId}.pdf`;
        const saved = await this.storageService.saveBuffer(pdfBuffer, '.pdf', previewKey);

        await this.prisma.teachingResource.update({
          where: { id: resourceId },
          data: {
            previewStatus: 'READY',
            previewStorageKey: saved.storedFileName,
            previewMimeType: 'application/pdf',
            previewGeneratedAt: new Date(),
            previewError: null,
          },
        });

        this.logger.log(`Preview successfully generated for resource ${resourceId}`);
      } finally {
        // Clean up temporary directory
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
    } catch (err: any) {
      this.logger.error(`Failed to generate preview for resource ${resourceId}: ${err?.message}`, err?.stack);
      await this.prisma.teachingResource.update({
        where: { id: resourceId },
        data: {
          previewStatus: 'FAILED',
          previewError: err?.message || 'Không thể tạo bản xem trước cho bài giảng này',
        },
      }).catch(() => {});
    }
  }
}
