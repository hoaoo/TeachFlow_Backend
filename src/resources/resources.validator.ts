import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import * as path from 'path';

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

export function validateUploadedFile(
  file: Express.Multer.File,
  maxSizeMb = 25,
): { extension: string; resourceType: string; sanitizedOriginalName: string } {
  if (!file) {
    throw new BadRequestException('Vui lòng chọn tập tin tải lên');
  }

  // 1. Check file size
  const maxBytes = maxSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new PayloadTooLargeException(
      `Dung lượng tập tin (${(file.size / (1024 * 1024)).toFixed(1)}MB) vượt quá giới hạn cho phép (${maxSizeMb}MB)`,
    );
  }

  // 2. Sanitize original filename and extract extension
  const rawName = file.originalname || 'uploaded_file';
  // Strip path traversal characters
  const baseName = path.basename(rawName);
  const ext = path.extname(baseName).toLowerCase();

  if (!ext) {
    throw new BadRequestException('Tập tin không có phần mở rộng hợp lệ');
  }

  // 3. Reject dangerous extensions
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    throw new BadRequestException(
      `Định dạng tập tin (${ext}) có nguy cơ bảo mật và không được phép tải lên hệ thống`,
    );
  }

  // 4. Check against allowlist
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new BadRequestException(
      `Định dạng tập tin (${ext}) không được hỗ trợ. Hệ thống chỉ hỗ trợ PDF, DOCX, PPTX, XLSX, PNG, JPG, WEBP, MP4`,
    );
  }

  // 5. Validate MIME type if known
  const clientMime = file.mimetype?.toLowerCase();
  const allowedMimes = MIME_TYPE_MAP[ext];
  if (allowedMimes && clientMime && !allowedMimes.includes(clientMime)) {
    // If browser sent generic application/octet-stream, we accept only if extension is whitelisted
    if (clientMime !== 'application/octet-stream') {
      throw new BadRequestException(
        `MIME type (${clientMime}) không khớp với định dạng tập tin (${ext})`,
      );
    }
  }

  // Clean original filename for display
  const sanitizedOriginalName = baseName.replace(/[\/\\?%*:|"<>]/g, '_').slice(0, 120);
  const resourceType = determineResourceType(ext);

  return {
    extension: ext,
    resourceType,
    sanitizedOriginalName,
  };
}
