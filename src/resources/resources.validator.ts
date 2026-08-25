import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import * as path from 'path';
import { decodeVietnameseFilename } from '../export/export.utils';

export const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.mp4',
];

export const DANGEROUS_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.ps1',
  '.vbs',
  '.js',
  '.ts',
  '.php',
  '.py',
  '.rb',
  '.pl',
  '.html',
  '.htm',
  '.msi',
  '.jar',
  '.com',
  '.scr',
];

export const MIME_TYPE_MAP: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
  ],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
  ],
  '.xls': ['application/vnd.ms-excel'],
  '.csv': ['text/csv', 'application/csv'],
  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
  ],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg', 'image/pjpeg'],
  '.jpeg': ['image/jpeg', 'image/pjpeg'],
  '.webp': ['image/webp'],
  '.mp4': ['video/mp4', 'video/x-m4v', 'video/quicktime'],
};

export function determineResourceType(ext: string): string {
  const normalized = ext.toLowerCase();
  if (['.pdf', '.doc', '.docx'].includes(normalized)) return 'DOCUMENT';
  if (['.ppt', '.pptx'].includes(normalized)) return 'PRESENTATION';
  if (['.xls', '.xlsx'].includes(normalized)) return 'SPREADSHEET';
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(normalized)) return 'IMAGE';
  if (['.mp4'].includes(normalized)) return 'VIDEO';
  return 'DOCUMENT';
}

export const IMPORT_ALLOWED_EXTENSIONS = ['.docx', '.pdf', '.xlsx', '.xls', '.csv', '.png', '.jpg', '.jpeg'];

export function detectMimeFromMagicBytes(buffer?: Buffer | null): string | null {
  if (!buffer || buffer.length < 4) return null;
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) {
    return 'application/vnd.ms-excel';
  }
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)) {
    return 'application/zip';
  }
  return null;
}

export function getResourceMaxSizeMb(resourceType: string, configService?: any): number {
  const getVal = (key: string, fallback: number): number => {
    const val = configService?.get ? configService.get(key) : process.env[key];
    if (val) {
      const parsed = parseInt(val, 10);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
    return fallback;
  };

  switch (resourceType) {
    case 'IMAGE':
      return getVal('RESOURCE_MAX_IMAGE_MB', 20);
    case 'DOCUMENT':
      return getVal('RESOURCE_MAX_DOC_MB', 50);
    case 'SPREADSHEET':
      return getVal('RESOURCE_MAX_SHEET_MB', 50);
    case 'PRESENTATION':
      return getVal('RESOURCE_MAX_PPT_MB', 100);
    case 'VIDEO':
      return getVal('RESOURCE_MAX_VIDEO_MB', 500);
    default:
      return getVal('RESOURCE_MAX_FILE_SIZE_MB', 50);
  }
}

export function validateUploadedFile(
  file: Express.Multer.File,
  maxSizeMb?: number,
  allowedExtensions: string[] = ALLOWED_EXTENSIONS,
  configService?: any,
): { extension: string; resourceType: string; sanitizedOriginalName: string } {
  if (!file) {
    throw new BadRequestException('Vui lòng chọn tập tin tải lên');
  }

  // 1. Sanitize original filename and extract extension with Vietnamese Unicode preservation
  const rawName = file.originalname || 'uploaded_file';
  const decodedName = decodeVietnameseFilename(rawName);
  const baseName = path.basename(decodedName);
  const ext = path.extname(baseName).toLowerCase();

  if (!ext) {
    throw new BadRequestException('Tập tin không có phần mở rộng hợp lệ');
  }

  // 2. Reject dangerous extensions
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    throw new BadRequestException(
      `Định dạng tập tin (${ext}) có nguy cơ bảo mật và không được phép tải lên hệ thống`,
    );
  }

  // 3. Check against allowlist
  if (!allowedExtensions.includes(ext)) {
    throw new BadRequestException(
      `Định dạng tập tin (${ext}) không được hỗ trợ. Hệ thống chỉ hỗ trợ ${allowedExtensions
        .map((item) => item.replace('.', '').toUpperCase())
        .join(', ')}`,
    );
  }

  const resourceType = determineResourceType(ext);
  const effectiveMaxSizeMb = maxSizeMb ?? getResourceMaxSizeMb(resourceType, configService);

  // 4. Check file size according to type
  const maxBytes = effectiveMaxSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new PayloadTooLargeException(
      `Dung lượng tập tin (${(file.size / (1024 * 1024)).toFixed(1)}MB) vượt quá giới hạn cho phép (${effectiveMaxSizeMb}MB)`,
    );
  }

  // 5. Validate MIME type if known — do not trust client MIME alone
  const clientMime = file.mimetype?.toLowerCase();
  const allowedMimes = MIME_TYPE_MAP[ext];
  const magicMime = detectMimeFromMagicBytes(file.buffer);
  if (allowedMimes && clientMime && !allowedMimes.includes(clientMime)) {
    if (clientMime !== 'application/octet-stream') {
      throw new BadRequestException(
        `MIME type (${clientMime}) không khớp với định dạng tập tin (${ext})`,
      );
    }
  }
  if (magicMime) {
    if (ext === '.pdf' && magicMime !== 'application/pdf') {
      throw new BadRequestException('Nội dung tệp không phải PDF hợp lệ');
    }
    if ((ext === '.png') && magicMime !== 'image/png') {
      throw new BadRequestException('Nội dung tệp không phải PNG hợp lệ');
    }
    if ((ext === '.jpg' || ext === '.jpeg') && magicMime !== 'image/jpeg') {
      throw new BadRequestException('Nội dung tệp không phải JPEG hợp lệ');
    }
    if (['.docx', '.xlsx'].includes(ext) && magicMime !== 'application/zip') {
      throw new BadRequestException(`Nội dung tệp không khớp định dạng ${ext}`);
    }
    if (ext === '.xls' && magicMime !== 'application/vnd.ms-excel' && magicMime !== 'application/zip') {
      throw new BadRequestException('Nội dung tệp không phải Excel hợp lệ');
    }
  }

  // Clean original filename for display, preserve Vietnamese characters
  const sanitizedOriginalName = baseName
    .replace(/[\/\\?%*:|"<>]/g, '_')
    .replace(/[\r\n\0]/g, '')
    .trim()
    .slice(0, 120);

  return {
    extension: ext,
    resourceType,
    sanitizedOriginalName,
  };
}
