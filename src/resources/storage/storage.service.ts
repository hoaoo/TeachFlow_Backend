import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface StoredFileResult {
  storedFileName: string;
  storagePath: string;
  size: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly uploadDir: string;

  constructor(private configService: ConfigService) {
    const configuredDir =
      this.configService.get<string>('RESOURCE_UPLOAD_DIR') || 'uploads/resources';
    this.uploadDir = path.resolve(process.cwd(), configuredDir);
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
  async saveBuffer(buffer: Buffer, originalExt: string): Promise<StoredFileResult> {
    this.ensureDirectoryExists();
    if (!buffer || buffer.length === 0) {
      throw new Error('File content is empty or invalid');
    }

    const cleanExt = originalExt.startsWith('.') ? originalExt : `.${originalExt}`;
    const storedFileName = `${crypto.randomUUID()}${cleanExt.toLowerCase()}`;
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
   * Get safe absolute file path for a stored file name
   */
  getSafeFilePath(storedFileName: string): string {
    // Strip any path traversal characters
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
