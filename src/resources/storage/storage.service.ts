import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PresignUploadDto, PresignedUploadResponseDto } from '../dto/presign-upload.dto';

export interface StoredFileResult {
  storedFileName: string;
  storagePath: string;
  size: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly uploadDir: string;
  private readonly signingSecret: string;

  constructor(private configService: ConfigService) {
    const configuredDir =
      this.configService.get<string>('RESOURCE_UPLOAD_DIR') || 'uploads/resources';
    this.uploadDir = path.resolve(process.cwd(), configuredDir);
    this.signingSecret =
      this.configService.get<string>('JWT_ACCESS_SECRET') || 'teachflow_storage_hmac_signing_secret_2026';
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Created uploads directory at: ${this.uploadDir}`);
    }
  }

  /**
   * Return the absolute storage root directory
   */
  getUploadDir(): string {
    return this.uploadDir;
  }

  /**
   * Generate Presigned Upload URL and fileKey for direct mobile/web upload
   */
  generatePresignedUpload(
    dto: PresignUploadDto,
    teacherId: string,
    baseUrl?: string,
  ): PresignedUploadResponseDto {
    this.ensureDirectoryExists();

    const rawExt = path.extname(dto.fileName) || '.dat';
    const cleanExt = rawExt.startsWith('.') ? rawExt.toLowerCase() : `.${rawExt.toLowerCase()}`;
    const uuid = crypto.randomUUID();
    const storedFileName = `${uuid}${cleanExt}`;
    const folder = dto.folder ? dto.folder.replace(/[^a-zA-Z0-9_-]/g, '') : 'resources';
    const fileKey = `${folder}/${storedFileName}`;

    const expiresIn = 3600; // 1 hour
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

    // Generate HMAC signature token for the direct upload
    const signature = crypto
      .createHmac('sha256', this.signingSecret)
      .update(`upload:${fileKey}:${teacherId}:${expiresAt}`)
      .digest('hex');

    const uploadToken = Buffer.from(
      JSON.stringify({ fileKey, teacherId, exp: expiresAt, sig: signature }),
    ).toString('base64url');

    const host = baseUrl || this.configService.get<string>('API_BASE_URL') || '';
    const uploadUrl = `${host}/api/resources/direct-upload/${storedFileName}?token=${uploadToken}`;

    return {
      uploadUrl,
      method: 'PUT',
      fileKey: storedFileName,
      headers: {
        'Content-Type': dto.contentType,
      },
      expiresIn,
    };
  }

  /**
   * Verify upload token for direct chunk upload
   */
  verifyUploadToken(storedFileName: string, token: string): { valid: boolean; teacherId?: string } {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
      if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
        return { valid: false };
      }

      const expectedSig = crypto
        .createHmac('sha256', this.signingSecret)
        .update(`upload:${decoded.fileKey}:${decoded.teacherId}:${decoded.exp}`)
        .digest('hex');

      if (decoded.sig !== expectedSig) {
        return { valid: false };
      }

      if (path.basename(decoded.fileKey) !== path.basename(storedFileName)) {
        return { valid: false };
      }

      return { valid: true, teacherId: decoded.teacherId };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Generate temporary signed access token for streaming / viewing a resource
   */
  generateSignedAccessToken(
    storedFileName: string,
    teacherId: string,
    ttlSeconds = 3600,
  ): { token: string; expiresAt: Date } {
    const sanitized = path.basename(storedFileName);
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const expiresAt = new Date(exp * 1000);

    const signature = crypto
      .createHmac('sha256', this.signingSecret)
      .update(`access:${sanitized}:${teacherId}:${exp}`)
      .digest('hex');

    const token = Buffer.from(
      JSON.stringify({ fileKey: sanitized, teacherId, exp, sig: signature }),
    ).toString('base64url');

    return { token, expiresAt };
  }

  /**
   * Verify signed access token for streaming / viewing
   */
  verifySignedAccessToken(
    storedFileName: string,
    token: string,
  ): { valid: boolean; teacherId?: string } {
    try {
      const sanitized = path.basename(storedFileName);
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
      if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
        return { valid: false };
      }

      const expectedSig = crypto
        .createHmac('sha256', this.signingSecret)
        .update(`access:${decoded.fileKey}:${decoded.teacherId}:${decoded.exp}`)
        .digest('hex');

      if (decoded.sig !== expectedSig || decoded.fileKey !== sanitized) {
        return { valid: false };
      }

      return { valid: true, teacherId: decoded.teacherId };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Save an uploaded file in memory/buffer to local disk with a sanitized UUID filename
   */
  async saveFile(file: Express.Multer.File, originalExt: string): Promise<StoredFileResult> {
    this.ensureDirectoryExists();

    const cleanExt = originalExt.startsWith('.') ? originalExt : `.${originalExt}`;
    const storedFileName = `${crypto.randomUUID()}${cleanExt.toLowerCase()}`;
    const fullPath = path.join(this.uploadDir, storedFileName);

    // Verify no path traversal outside uploadDir
    if (!fullPath.startsWith(this.uploadDir)) {
      throw new Error('Path traversal detected');
    }

    if (file.buffer) {
      await fs.promises.writeFile(fullPath, file.buffer);
    } else if (file.path && fs.existsSync(file.path)) {
      await fs.promises.copyFile(file.path, fullPath);
      // Clean up multer temporary file if present
      fs.unlink(file.path, () => {});
    } else {
      throw new Error('File content is empty or invalid');
    }

    return {
      storedFileName,
      storagePath: fullPath,
      size: file.size,
    };
  }

  /**
   * Persist a generated (or already-in-memory) buffer. Never writes outside uploadDir.
   */
  async saveBuffer(buffer: Buffer, originalExt: string, customFileName?: string): Promise<StoredFileResult> {
    this.ensureDirectoryExists();
    if (!buffer || buffer.length === 0) {
      throw new Error('File content is empty or invalid');
    }

    const cleanExt = originalExt.startsWith('.') ? originalExt : `.${originalExt}`;
    const storedFileName = customFileName
      ? path.basename(customFileName)
      : `${crypto.randomUUID()}${cleanExt.toLowerCase()}`;
    const fullPath = path.join(this.uploadDir, storedFileName);

    if (!fullPath.startsWith(this.uploadDir)) {
      throw new Error('Path traversal detected');
    }

    await fs.promises.writeFile(fullPath, buffer);
    return {
      storedFileName,
      storagePath: fullPath,
      size: buffer.length,
    };
  }

  /**
   * Save a streaming direct upload payload
   */
  async saveStreamToFile(
    storedFileName: string,
    stream: NodeJS.ReadableStream,
  ): Promise<{ size: number; filePath: string }> {
    this.ensureDirectoryExists();
    const filePath = this.getSafeFilePath(storedFileName);

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath);
      let size = 0;

      stream.on('data', (chunk) => {
        size += chunk.length;
      });

      stream.pipe(writeStream);

      writeStream.on('finish', () => {
        resolve({ size, filePath });
      });

      writeStream.on('error', (err) => {
        reject(err);
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Get safe absolute file path for a stored file name
   */
  getSafeFilePath(storedFileName: string): string {
    const sanitized = path.basename(storedFileName);
    const fullPath = path.join(this.uploadDir, sanitized);

    if (!fullPath.startsWith(this.uploadDir)) {
      throw new Error('Path traversal detected');
    }

    return fullPath;
  }

  /**
   * Check if file exists on disk
   */
  async fileExists(storedFileName: string): Promise<boolean> {
    try {
      const filePath = this.getSafeFilePath(storedFileName);
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata from disk
   */
  async getFileStats(storedFileName: string): Promise<fs.Stats | null> {
    try {
      const filePath = this.getSafeFilePath(storedFileName);
      return await fs.promises.stat(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Delete physical file from disk
   */
  async deleteFile(storedFileName: string): Promise<boolean> {
    try {
      const filePath = this.getSafeFilePath(storedFileName);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        return true;
      }
      return false;
    } catch (err: any) {
      this.logger.warn(`Failed to delete physical file ${storedFileName}: ${err?.message}`);
      return false;
    }
  }
}
