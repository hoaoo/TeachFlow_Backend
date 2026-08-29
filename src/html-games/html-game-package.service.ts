import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import JSZip = require('jszip');
import {
  DEFAULT_HTML_GAME_MAX_EXTRACTED_BYTES,
  DEFAULT_HTML_GAME_MAX_FILE_COUNT,
  DEFAULT_HTML_GAME_MAX_SOURCE_BYTES,
  DEFAULT_HTML_GAME_MAX_UPLOAD_BYTES,
  HTML_GAME_ALLOWED_EXTENSIONS,
} from './html-game.constants';
import { TEACHFLOW_GAME_RUNTIME_SOURCE } from './html-game-runtime';

const HTML_GAME_RUNTIME_FILE = 'teachflow-game-runtime.js';
const HTML_GAME_RUNTIME_TAG =
  '<script src="./teachflow-game-runtime.js" data-teachflow-runtime="1"></script>';

export interface ParsedHtmlGameFile {
  relativePath: string;
  contentType: string;
  body: Buffer;
}

export interface ParsedHtmlGamePackage {
  files: ParsedHtmlGameFile[];
  totalSize: number;
}

@Injectable()
export class HtmlGamePackageService {
  constructor(private readonly config: ConfigService) {}

  async parse(file: Express.Multer.File): Promise<ParsedHtmlGamePackage> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Vui lòng chọn tệp HTML hoặc ZIP');
    }
    if (file.buffer.length > this.maxUploadBytes) {
      throw new PayloadTooLargeException('Gói trò chơi vượt quá kích thước tải lên cho phép');
    }

    const extension = path.extname(path.basename(file.originalname || '')).toLowerCase();
    if (extension === '.html') {
      if (!this.hasAllowedMime(file.mimetype, ['text/html', 'application/xhtml+xml'])) {
        throw new BadRequestException('MIME của tệp HTML không hợp lệ');
      }
      return this.withRuntime([{
          relativePath: 'index.html',
          contentType: 'text/html; charset=utf-8',
          body: file.buffer,
        }]);
    }
    if (extension !== '.zip') {
      throw new BadRequestException('Chỉ chấp nhận một tệp .html hoặc gói .zip');
    }
    if (!this.hasAllowedMime(file.mimetype, [
      'application/zip',
      'application/x-zip-compressed',
    ])) {
      throw new BadRequestException('MIME của tệp ZIP không hợp lệ');
    }

    let archive: JSZip;
    try {
      archive = await JSZip.loadAsync(file.buffer, {
        checkCRC32: true,
        createFolders: false,
      });
    } catch {
      throw new BadRequestException('Tệp ZIP không hợp lệ hoặc đã bị hỏng');
    }

    const entries = Object.values(archive.files).filter((entry) => !entry.dir);
    if (entries.length > this.maxFileCount) {
      throw new BadRequestException('Gói trò chơi chứa quá nhiều tệp');
    }

    let declaredTotal = 0;
    const validated = entries.map((entry) => {
      const unixPermissions = Number((entry as any).unixPermissions || 0);
      if ((unixPermissions & 0o170000) === 0o120000) {
        throw new BadRequestException('Không chấp nhận symbolic link trong gói ZIP');
      }
      const rawName = String((entry as any).unsafeOriginalName || entry.name);
      const relativePath = this.validateRelativePath(rawName);
      const extension = path.posix.extname(relativePath).toLowerCase();
      if (!HTML_GAME_ALLOWED_EXTENSIONS.has(extension)) {
        throw new BadRequestException(`Định dạng tệp không được phép trong ZIP: ${relativePath}`);
      }
      const declaredSize = Number((entry as any)?._data?.uncompressedSize || 0);
      if (!Number.isSafeInteger(declaredSize) || declaredSize < 0) {
        throw new BadRequestException('Kích thước tệp trong ZIP không hợp lệ');
      }
      declaredTotal += declaredSize;
      if (declaredTotal > this.maxExtractedBytes) {
        throw new PayloadTooLargeException('Dung lượng giải nén vượt quá giới hạn cho phép');
      }
      return { entry, relativePath };
    });

    if (!validated.some(({ relativePath }) => relativePath === 'index.html')) {
      throw new BadRequestException('Gói ZIP phải chứa index.html ở thư mục gốc');
    }

    const files: ParsedHtmlGameFile[] = [];
    let actualTotal = 0;
    for (const { entry, relativePath } of validated) {
      const body = await entry.async('nodebuffer');
      actualTotal += body.length;
      if (actualTotal > this.maxExtractedBytes) {
        throw new PayloadTooLargeException('Dung lượng giải nén vượt quá giới hạn cho phép');
      }
      files.push({
        relativePath,
        contentType: this.contentTypeFor(relativePath),
        body,
      });
    }

    const entryFile = files.find((item) => item.relativePath === 'index.html');
    if (!entryFile?.body.length) {
      throw new BadRequestException('index.html không được để trống');
    }
    return this.withRuntime(files);
  }

  parseSource(html: string): ParsedHtmlGamePackage {
    const source = String(html || '');
    const body = Buffer.from(source, 'utf8');
    if (!source.trim()) {
      throw new BadRequestException('Mã HTML không được để trống');
    }
    if (body.length > DEFAULT_HTML_GAME_MAX_SOURCE_BYTES) {
      throw new PayloadTooLargeException('Mã HTML dán trực tiếp vượt quá giới hạn 80 KB');
    }
    return this.withRuntime([{
        relativePath: 'index.html',
        contentType: 'text/html; charset=utf-8',
        body,
      }]);
  }

  private withRuntime(files: ParsedHtmlGameFile[]): ParsedHtmlGamePackage {
    const runtimeBody = Buffer.from(TEACHFLOW_GAME_RUNTIME_SOURCE, 'utf8');
    const normalized = files
      .filter((item) => item.relativePath !== HTML_GAME_RUNTIME_FILE)
      .map((item) => item.relativePath === 'index.html'
        ? { ...item, body: Buffer.from(this.injectRuntime(item.body.toString('utf8')), 'utf8') }
        : item);
    normalized.push({
      relativePath: HTML_GAME_RUNTIME_FILE,
      contentType: 'text/javascript; charset=utf-8',
      body: runtimeBody,
    });
    const totalSize = normalized.reduce((total, item) => total + item.body.length, 0);
    if (totalSize > this.maxExtractedBytes) {
      throw new PayloadTooLargeException(
        'HTML game package exceeds the extracted-size limit after adding the runtime',
      );
    }
    return { files: normalized, totalSize };
  }

  private injectRuntime(html: string): string {
    const existingRuntime = /<script\b[^>]*\bsrc=["'][^"']*teachflow-game-runtime\.js[^"']*["'][^>]*><\/script>/i;
    if (existingRuntime.test(html)) {
      return html.replace(existingRuntime, HTML_GAME_RUNTIME_TAG);
    }
    const head = /<head(?:\s[^>]*)?>/i;
    if (head.test(html)) {
      return html.replace(head, (match) => `${match}\n  ${HTML_GAME_RUNTIME_TAG}`);
    }
    const doctype = /<!doctype\s+html[^>]*>/i;
    if (doctype.test(html)) {
      return html.replace(doctype, (match) => `${match}\n${HTML_GAME_RUNTIME_TAG}`);
    }
    return `${HTML_GAME_RUNTIME_TAG}\n${html}`;
  }

  private hasAllowedMime(actual: string | undefined, allowed: string[]): boolean {
    const mime = String(actual || '').toLowerCase().split(';')[0].trim();
    return !mime || mime === 'application/octet-stream' || allowed.includes(mime);
  }

  private validateRelativePath(rawName: string): string {
    if (!rawName || rawName.includes('\0')) {
      throw new BadRequestException('Tên tệp trong ZIP không hợp lệ');
    }
    const decoded = this.safeDecode(rawName).replace(/\\/g, '/');
    const parts = decoded.split('/');
    if (
      decoded.startsWith('/') ||
      /^[a-zA-Z]:/.test(decoded) ||
      parts.some((part) => !part || part === '.' || part === '..')
    ) {
      throw new BadRequestException('Phát hiện đường dẫn không an toàn trong ZIP');
    }
    return parts.join('/');
  }

  private safeDecode(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      throw new BadRequestException('Tên tệp mã hóa không hợp lệ trong ZIP');
    }
  }

  private contentTypeFor(fileName: string): string {
    const extension = path.posix.extname(fileName).toLowerCase();
    const types: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.htm': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.mjs': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.txt': 'text/plain; charset=utf-8',
      '.csv': 'text/csv; charset=utf-8',
      '.xml': 'application/xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.otf': 'font/otf',
      '.webmanifest': 'application/manifest+json',
    };
    return types[extension] || 'application/octet-stream';
  }

  private get maxUploadBytes(): number {
    return this.megabytes('HTML_GAME_MAX_UPLOAD_MB', DEFAULT_HTML_GAME_MAX_UPLOAD_BYTES);
  }

  private get maxExtractedBytes(): number {
    return this.megabytes(
      'HTML_GAME_MAX_EXTRACTED_MB',
      DEFAULT_HTML_GAME_MAX_EXTRACTED_BYTES,
    );
  }

  private get maxFileCount(): number {
    const value = Number(this.config.get<string>('HTML_GAME_MAX_FILE_COUNT'));
    return Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : DEFAULT_HTML_GAME_MAX_FILE_COUNT;
  }

  private megabytes(key: string, fallbackBytes: number): number {
    const value = Number(this.config.get<string>(key));
    return Number.isFinite(value) && value > 0
      ? value * 1024 * 1024
      : fallbackBytes;
  }
}
