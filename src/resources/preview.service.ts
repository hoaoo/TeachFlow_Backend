import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
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

        if (binary) {
          try {
            this.logger.log(`Attempting LibreOffice conversion for resource ${resourceId} using ${binary}`);
            // Use execFile with explicit arguments array to prevent any shell injection
            await execFileAsync(
              binary,
              ['--headless', '--convert-to', 'pdf', '--outdir', tempDir, originalFilePath],
              { timeout: 45000, maxBuffer: 10 * 1024 * 1024 },
            );

            const baseName = path.basename(originalFilePath, ext);
            const convertedPdfPath = path.join(tempDir, `${baseName}.pdf`);

            if (fs.existsSync(convertedPdfPath)) {
              pdfBuffer = fs.readFileSync(convertedPdfPath);
            }
          } catch (convErr: any) {
            this.logger.warn(`LibreOffice conversion failed for ${resourceId}: ${convErr?.message}. Falling back to clean preview document.`);
          }
        }

        // Fallback: Generate a clean preview PDF using pdfmake if LibreOffice not available
        if (!pdfBuffer) {
          pdfBuffer = await this.generateFallbackPptxPdf(originalFileName || 'Bài giảng PowerPoint');
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

  private generateFallbackPptxPdf(title: string): Promise<Buffer> {
    return new Promise((resolve) => {
      // Simple valid PDF generation without external deps using PDF stream/buffer
      // PDF 1.4 minimal document
      const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 200 >>
stream
BT
/F1 20 Tf
50 700 Td
(TeachFlow Presentation Preview) Tj
/F1 12 Tf
0 -30 Td
(File: ${title.replace(/[()]/g, '')}) Tj
0 -25 Td
(Ban xem truoc bai giang PowerPoint san sang.) Tj
0 -20 Td
(Vui long tai ve hoac mo bang PowerPoint de trinh chieu day du hieu ung.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000227 00000 n 
0000000478 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
557
%%EOF`;
      resolve(Buffer.from(content, 'utf-8'));
    });
  }
}
