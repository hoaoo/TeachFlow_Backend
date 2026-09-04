import {
  Injectable,
  Logger,
  Optional,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PresignUploadDto, PresignedUploadResponseDto } from '../dto/presign-upload.dto';
import { ObjectStorageService } from './object-storage.service';

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

  constructor(
    private configService: ConfigService,
    @Optional() private readonly objectStorage?: ObjectStorageService,
  ) {
    const configuredDir =
      this.configService.get<string>('RESOURCE_UPLOAD_DIR') || 'uploads/resources';
    this.uploadDir = path.resolve(process.cwd(), configuredDir);
    this.signingSecret =
      this.configService.get<string>('JWT_ACCESS_SECRET') || 'teachflow_storage_hmac_signing_secret_2026';
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    try {
      if (!fs.existsSync(this.uploadDir)) {
        fs.mkdirSync(this.uploadDir, { recursive: true });
        this.logger.log(`Created uploads directory at: ${this.uploadDir}`);
      }
    } catch (err: any) {
      this.logger.error(`Failed to ensure upload directory (${this.uploadDir}): ${err?.message}`);
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
  /**
   * Save an uploaded file in memory/buffer to local disk with a sanitized UUID filename,
   * and persist to S3/R2 if object storage is configured.
   */
  async saveFile(file: Express.Multer.File, originalExt: string): Promise<StoredFileResult> {
    this.ensureDirectoryExists();

    if (!file) {
      throw new BadRequestException('Vui lòng chọn tập tin tải lên');
    }

    const cleanExt = originalExt.startsWith('.') ? originalExt : `.${originalExt}`;
    const storedFileName = `${crypto.randomUUID()}${cleanExt.toLowerCase()}`;
    const fullPath = path.join(this.uploadDir, storedFileName);

    // Verify no path traversal outside uploadDir
    if (!fullPath.startsWith(this.uploadDir)) {
      throw new BadRequestException('Đường dẫn lưu trữ tập tin không hợp lệ');
    }

    try {
      let fileBuffer: Buffer | null = null;
      if (file.buffer && file.buffer.length > 0) {
        fileBuffer = file.buffer;
        await fs.promises.writeFile(fullPath, fileBuffer);
      } else if (file.path && fs.existsSync(file.path)) {
        await fs.promises.copyFile(file.path, fullPath);
        fileBuffer = await fs.promises.readFile(fullPath);
        // Clean up multer temporary file if present
        fs.unlink(file.path, () => {});
      } else {
        throw new BadRequestException('Nội dung tập tin tải lên không hợp lệ hoặc rỗng');
      }

      // Persist to S3/R2 if configured
      if (this.objectStorage?.isS3Configured() && fileBuffer) {
        try {
          await this.objectStorage.putObject({
            key: `resources/${storedFileName}`,
            body: fileBuffer,
            contentType: file.mimetype || 'application/octet-stream',
          });
        } catch (uploadErr: any) {
          this.logger.warn(`Failed to persist file ${storedFileName} to object storage: ${uploadErr?.message}`);
        }
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error(`Storage disk write failure for file ${storedFileName}: ${err?.message}`, err?.stack);
      throw new InternalServerErrorException('Không thể ghi tập tin lên hệ thống lưu trữ');
    }

    return {
      storedFileName,
      storagePath: fullPath,
      size: file.size || (file.buffer ? file.buffer.length : 0),
    };
  }

  /**
   * Persist a generated (or already-in-memory) buffer. Never writes outside uploadDir.
   * Persists to S3/R2 if object storage is configured.
   */
  async saveBuffer(buffer: Buffer, originalExt: string, customFileName?: string): Promise<StoredFileResult> {
    this.ensureDirectoryExists();
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Nội dung dữ liệu không hợp lệ hoặc rỗng');
    }

    const cleanExt = originalExt.startsWith('.') ? originalExt : `.${originalExt}`;
    const storedFileName = customFileName
      ? path.basename(customFileName)
      : `${crypto.randomUUID()}${cleanExt.toLowerCase()}`;
    const fullPath = path.join(this.uploadDir, storedFileName);

    if (!fullPath.startsWith(this.uploadDir)) {
      throw new BadRequestException('Đường dẫn lưu trữ tập tin không hợp lệ');
    }

    try {
      await fs.promises.writeFile(fullPath, buffer);

      // Persist to S3/R2 if configured
      if (this.objectStorage?.isS3Configured()) {
        try {
          await this.objectStorage.putObject({
            key: `resources/${storedFileName}`,
            body: buffer,
            contentType: 'application/octet-stream',
          });
        } catch (uploadErr: any) {
          this.logger.warn(`Failed to persist buffer ${storedFileName} to object storage: ${uploadErr?.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Storage buffer write failure for ${storedFileName}: ${err?.message}`, err?.stack);
      throw new InternalServerErrorException('Không thể ghi dữ liệu tập tin lên hệ thống lưu trữ');
    }

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

    const result = await new Promise<{ size: number; filePath: string }>((resolve, reject) => {
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

    if (this.objectStorage?.isS3Configured()) {
      try {
        const buffer = await fs.promises.readFile(filePath);
        await this.objectStorage.putObject({
          key: `resources/${path.basename(storedFileName)}`,
          body: buffer,
          contentType: 'application/octet-stream',
        });
      } catch (uploadErr: any) {
        this.logger.warn(`Failed to sync streamed file ${storedFileName} to object storage: ${uploadErr?.message}`);
      }
    }

    return result;
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
   * Ensure file exists on local disk. If missing from disk but exists in S3/R2,
   * restores it from S3/R2 into local disk cache.
   */
  async ensureLocalFile(storedFileName: string): Promise<string> {
    const filePath = this.getSafeFilePath(storedFileName);
    if (fs.existsSync(filePath)) {
      return filePath;
    }

    if (this.objectStorage?.isS3Configured()) {
      const s3Key = `resources/${path.basename(storedFileName)}`;
      try {
        const existsInS3 = await this.objectStorage.objectExists(s3Key);
        if (existsInS3) {
          const buffer = await this.objectStorage.getObjectBuffer(s3Key);
          await fs.promises.writeFile(filePath, buffer);
          this.logger.log(`Restored file from object storage to local cache: ${storedFileName}`);
          return filePath;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to restore ${storedFileName} from object storage: ${err?.message}`);
      }
    }

    return filePath;
  }

  /**
   * Check if file exists on disk or in S3/R2 object storage
   */
  async fileExists(storedFileName: string): Promise<boolean> {
    try {
      const filePath = this.getSafeFilePath(storedFileName);
      if (fs.existsSync(filePath)) {
        return true;
      }

      if (this.objectStorage?.isS3Configured()) {
        const s3Key = `resources/${path.basename(storedFileName)}`;
        const existsInS3 = await this.objectStorage.objectExists(s3Key);
        if (existsInS3) {
          // Restore to local cache so downstream file operations succeed
          await this.ensureLocalFile(storedFileName);
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata from disk (restoring from S3/R2 if needed)
   */
  async getFileStats(storedFileName: string): Promise<fs.Stats | null> {
    try {
      const filePath = await this.ensureLocalFile(storedFileName);
      if (fs.existsSync(filePath)) {
        return await fs.promises.stat(filePath);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Delete physical file from disk and S3/R2 object storage
   */
  async deleteFile(storedFileName: string): Promise<boolean> {
    let deleted = false;
    try {
      const filePath = this.getSafeFilePath(storedFileName);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        deleted = true;
      }
    } catch (err: any) {
      this.logger.warn(`Failed to delete physical file ${storedFileName}: ${err?.message}`);
    }

    if (this.objectStorage?.isS3Configured()) {
      try {
        const s3Key = `resources/${path.basename(storedFileName)}`;
        await this.objectStorage.deleteObject(s3Key);
        deleted = true;
      } catch (err: any) {
        this.logger.warn(`Failed to delete object storage file ${storedFileName}: ${err?.message}`);
      }
    }

    return deleted;
  }
}
