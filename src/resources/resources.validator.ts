import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import * as path from 'path';
import { decodeVietnameseFilename } from '../export/export.utils';

export const ALLOWED_EXTENSIONS = [
  // Documents
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.txt',
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  // Audio
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  // Video
  '.mp4',
  '.webm',
  '.mov',
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
  '.pif',
  '.application',
  '.gadget',
  '.msp',
  '.hta',
  '.cpl',
  '.msc',
];

export const MIME_TYPE_MAP: Record<string, string[]> = {
  // Documents
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/x-zip-compressed',
  ],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed',
  ],
  '.xls': ['application/vnd.ms-excel', 'application/msexcel', 'application/x-msexcel'],
  '.csv': ['text/csv', 'application/csv', 'text/plain'],
  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-zip-compressed',
  ],
  '.txt': ['text/plain', 'text/csv'],
  // Images
  '.png': ['image/png'],
  '.jpg': ['image/jpeg', 'image/pjpeg'],
  '.jpeg': ['image/jpeg', 'image/pjpeg'],
  '.webp': ['image/webp'],
  '.gif': ['image/gif'],
  // Audio
  '.mp3': ['audio/mpeg', 'audio/mp3', 'audio/x-mpeg', 'audio/mpeg3', 'audio/x-mp3'],
  '.wav': ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/x-pn-wav'],
  '.m4a': ['audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/x-aac', 'audio/m4a'],
  '.aac': ['audio/aac', 'audio/x-aac', 'audio/mp4'],
  // Video
  '.mp4': ['video/mp4', 'video/x-m4v', 'video/quicktime'],
  '.webm': ['video/webm', 'audio/webm'],
  '.mov': ['video/quicktime', 'video/mp4'],
};

export function determineResourceType(ext: string): 'DOCUMENT' | 'PRESENTATION' | 'SPREADSHEET' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'OTHER' {
  const normalized = ext.toLowerCase();
  if (['.pdf', '.doc', '.docx', '.txt'].includes(normalized)) return 'DOCUMENT';
  if (['.ppt', '.pptx'].includes(normalized)) return 'PRESENTATION';
  if (['.xls', '.xlsx', '.csv'].includes(normalized)) return 'SPREADSHEET';
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(normalized)) return 'IMAGE';
  if (['.mp3', '.wav', '.m4a', '.aac'].includes(normalized)) return 'AUDIO';
  if (['.mp4', '.webm', '.mov'].includes(normalized)) return 'VIDEO';
  return 'OTHER';
}

export const IMPORT_ALLOWED_EXTENSIONS = ['.docx', '.pdf', '.xlsx', '.xls', '.csv', '.png', '.jpg', '.jpeg', '.txt'];

export function detectMimeFromMagicBytes(buffer?: Buffer | null): string | null {
  if (!buffer || buffer.length < 4) return null;

  // PDF: %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }
  // PNG: \x89PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  // JPEG: \xff\xd8\xff
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // GIF: GIF87a or GIF89a
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'image/gif';
  }
  // WebM / Matroska: \x1a\x45\xdf\xa3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return 'video/webm';
  }
  // WAV: RIFF....WAVE
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x41 &&
    buffer[10] === 0x56 &&
    buffer[11] === 0x45
  ) {
    return 'audio/wav';
  }
  // MP3 with ID3 tag: ID3
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return 'audio/mpeg';
  }
  // MP3 raw frame sync: \xff\xfb, \xff\xf3, \xff\xf2, \xff\xe3
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }
  // MP4 / MOV: ftyp at index 4
  if (
    buffer.length >= 8 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return 'video/mp4';
  }
  // OLE2 (Legacy Excel/Word/PPT): \xd0\xcf\x11\xe0
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) {
    return 'application/vnd.ms-excel';
  }
  // ZIP / OpenXML (docx, xlsx, pptx): PK\x03\x04 or PK\x05\x06
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)) {
    return 'application/zip';
  }
  return null;
}

export function getResourceMaxSizeMb(resourceType: string, configService?: any): number {
  const getVal = (keys: string[], fallback: number): number => {
    for (const key of keys) {
      const val = configService?.get ? configService.get(key) : process.env[key];
      if (val) {
        const parsed = parseInt(val, 10);
        if (!Number.isNaN(parsed) && parsed > 0) return parsed;
      }
    }
    return fallback;
  };

  switch (resourceType) {
    case 'IMAGE':
      return getVal(['RESOURCE_MAX_IMAGE_SIZE_MB', 'RESOURCE_MAX_IMAGE_MB'], 20);
    case 'DOCUMENT':
      return getVal(['RESOURCE_MAX_DOCUMENT_SIZE_MB', 'RESOURCE_MAX_DOC_MB'], 50);
    case 'SPREADSHEET':
      return getVal(['RESOURCE_MAX_SPREADSHEET_SIZE_MB', 'RESOURCE_MAX_SHEET_MB', 'RESOURCE_MAX_DOCUMENT_SIZE_MB'], 50);
    case 'PRESENTATION':
      return getVal(['RESOURCE_MAX_PRESENTATION_SIZE_MB', 'RESOURCE_MAX_PPT_MB', 'RESOURCE_MAX_DOCUMENT_SIZE_MB'], 100);
    case 'AUDIO':
      return getVal(['RESOURCE_MAX_AUDIO_SIZE_MB', 'RESOURCE_MAX_AUDIO_MB'], 50);
    case 'VIDEO':
      return getVal(['RESOURCE_MAX_VIDEO_SIZE_MB', 'RESOURCE_MAX_VIDEO_MB'], 500);
    default:
      return getVal(['RESOURCE_MAX_FILE_SIZE_MB'], 100);
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

  // 2. Reject dangerous / executable extensions
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
    if (ext === '.png' && magicMime !== 'image/png') {
      throw new BadRequestException('Nội dung tệp không phải PNG hợp lệ');
    }
    if ((ext === '.jpg' || ext === '.jpeg') && magicMime !== 'image/jpeg') {
      throw new BadRequestException('Nội dung tệp không phải JPEG hợp lệ');
    }
    if (ext === '.gif' && magicMime !== 'image/gif') {
      throw new BadRequestException('Nội dung tệp không phải GIF hợp lệ');
    }
    if (['.docx', '.xlsx', '.pptx'].includes(ext) && magicMime !== 'application/zip') {
      throw new BadRequestException(`Nội dung tệp không khớp định dạng ${ext}`);
    }
    if (ext === '.xls' && magicMime !== 'application/vnd.ms-excel' && magicMime !== 'application/zip') {
      throw new BadRequestException('Nội dung tệp không phải Excel hợp lệ');
    }
    if (ext === '.mp3' && magicMime !== 'audio/mpeg') {
      throw new BadRequestException('Nội dung tệp không phải MP3 hợp lệ');
    }
    if (ext === '.wav' && magicMime !== 'audio/wav') {
      throw new BadRequestException('Nội dung tệp không phải WAV hợp lệ');
    }
    if (ext === '.webm' && magicMime !== 'video/webm') {
      throw new BadRequestException('Nội dung tệp không phải WebM hợp lệ');
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
