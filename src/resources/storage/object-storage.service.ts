import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

export interface ObjectStorageUpload {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface LocalFileStreamInfo {
  stream: fs.ReadStream;
  contentType: string;
  size: number;
}

const MIME_MAP: Record<string, string> = {
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

@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private client?: S3Client;
  private readonly localDir: string;

  constructor(private readonly config: ConfigService) {
    const configuredDir =
      this.config.get<string>('RESOURCE_UPLOAD_DIR') || 'uploads/resources';
    this.localDir = path.resolve(process.cwd(), configuredDir, 'html-games');
    this.ensureLocalDir();
  }

  private ensureLocalDir(): void {
    try {
      if (!fs.existsSync(this.localDir)) {
        fs.mkdirSync(this.localDir, { recursive: true });
      }
    } catch (err: any) {
      this.logger.error(`Failed to create local html-games directory: ${err?.message}`);
    }
  }

  isS3Configured(): boolean {
    const bucket = this.config.get<string>('OBJECT_STORAGE_BUCKET')?.trim();
    const accessKeyId = this.config.get<string>('OBJECT_STORAGE_ACCESS_KEY_ID')?.trim();
    const secretAccessKey = this.config.get<string>('OBJECT_STORAGE_SECRET_ACCESS_KEY')?.trim();
    return Boolean(bucket && accessKeyId && secretAccessKey);
  }

  private getLocalPath(safeKey: string): string {
    const configuredDir =
      this.config.get<string>('RESOURCE_UPLOAD_DIR') || 'uploads/resources';
    const baseUploadDir = path.resolve(process.cwd(), configuredDir);
    const target = (safeKey.startsWith('resources/') || safeKey.startsWith('presentations/'))
      ? path.join(baseUploadDir, safeKey)
      : path.join(this.localDir, safeKey);

    const allowedPrefix = (safeKey.startsWith('resources/') || safeKey.startsWith('presentations/'))
      ? baseUploadDir
      : this.localDir;

    if (!target.startsWith(allowedPrefix)) {
      throw new InternalServerErrorException('Khóa lưu trữ đối tượng không hợp lệ');
    }
    return target;
  }

  async putObject(file: ObjectStorageUpload): Promise<void> {
    const key = this.assertSafeKey(file.key);
    if (this.isS3Configured()) {
      const { client, bucket } = this.connection();
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.body,
        ContentType: file.contentType,
        CacheControl: 'no-store',
      }));
      return;
    }

    // Local storage driver
    this.ensureLocalDir();
    const fullPath = this.getLocalPath(key);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, file.body);
  }

  async objectExists(key: string): Promise<boolean> {
    const safeKey = this.assertSafeKey(key);
    if (this.isS3Configured()) {
      const { client, bucket } = this.connection();
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: safeKey }));
        return true;
      } catch (error: any) {
        const status = error?.$metadata?.httpStatusCode;
        if (status === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey') {
          return false;
        }
        throw error;
      }
    }

    // Local storage driver
    const fullPath = this.getLocalPath(safeKey);
    return fs.existsSync(fullPath);
  }

  async deletePrefix(prefix: string): Promise<void> {
    const safePrefix = this.assertSafeKey(prefix).replace(/\/+$/, '') + '/';
    if (this.isS3Configured()) {
      const { client, bucket } = this.connection();
      let continuationToken: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: safePrefix,
          ContinuationToken: continuationToken,
        }));
        const keys = (page.Contents || [])
          .map((item) => item.Key)
          .filter((key): key is string => Boolean(key));
        for (let offset = 0; offset < keys.length; offset += 1000) {
          const batch = keys.slice(offset, offset + 1000);
          if (batch.length) {
            await client.send(new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
            }));
          }
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken);
      return;
    }

    // Local storage driver
    const fullPrefixPath = this.getLocalPath(this.assertSafeKey(prefix));
    if (fs.existsSync(fullPrefixPath)) {
      await fs.promises.rm(fullPrefixPath, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async deleteObject(key: string): Promise<void> {
    const safeKey = this.assertSafeKey(key);
    if (this.isS3Configured()) {
      const { client, bucket } = this.connection();
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: safeKey }));
      return;
    }

    // Local storage driver
    const fullPath = this.getLocalPath(safeKey);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath).catch(() => undefined);
    }
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const safeKey = this.assertSafeKey(key);
    if (this.isS3Configured()) {
      const { client, bucket } = this.connection();
      try {
        const response: GetObjectCommandOutput = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: safeKey }),
        );
        if (!response.Body) {
          throw new NotFoundException('Không tìm thấy tệp lưu trữ');
        }
        const stream = response.Body as Readable;
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      } catch (error: any) {
        const status = error?.$metadata?.httpStatusCode;
        if (status === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey') {
          throw new NotFoundException('Không tìm thấy tệp lưu trữ');
        }
        throw error;
      }
    }

    // Local storage driver
    const fullPath = this.getLocalPath(safeKey);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Không tìm thấy tệp lưu trữ');
    }
    return fs.promises.readFile(fullPath);
  }

  async getFileStream(key: string): Promise<LocalFileStreamInfo> {
    const safeKey = this.assertSafeKey(key);
    const ext = path.extname(safeKey).toLowerCase();
    const defaultContentType = MIME_MAP[ext] || 'application/octet-stream';

    if (this.isS3Configured()) {
      const { client, bucket } = this.connection();
      try {
        const response: GetObjectCommandOutput = await client.send(new GetObjectCommand({
          Bucket: bucket,
          Key: safeKey,
        }));
        if (!response.Body) {
          throw new NotFoundException('Không tìm thấy tệp lưu trữ');
        }
        return {
          stream: response.Body as any,
          contentType: response.ContentType || defaultContentType,
          size: response.ContentLength || 0,
        };
      } catch (error: any) {
        const status = error?.$metadata?.httpStatusCode;
        if (status === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey') {
          throw new NotFoundException('Không tìm thấy tệp lưu trữ');
        }
        throw error;
      }
    }

    // Local storage driver
    const fullPath = this.getLocalPath(safeKey);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Không tìm thấy tệp lưu trữ');
    }
    const stat = await fs.promises.stat(fullPath);
    if (stat.isDirectory()) {
      throw new NotFoundException('Không tìm thấy tệp lưu trữ');
    }
    return {
      stream: fs.createReadStream(fullPath),
      contentType: defaultContentType,
      size: stat.size,
    };
  }

  async getLocalFileStream(key: string): Promise<LocalFileStreamInfo> {
    return this.getFileStream(key);
  }

  getPublicUrl(key: string): string {
    const safeKey = this.assertSafeKey(key);
    const configuredBase = this.config.get<string>('OBJECT_STORAGE_PUBLIC_BASE_URL')?.trim();
    let baseUrl = configuredBase;

    if (!baseUrl) {
      const apiBase = (this.config.get<string>('API_BASE_URL') || '').trim().replace(/\/+$/, '');
      const renderHost = (this.config.get<string>('RENDER_EXTERNAL_HOSTNAME') || '').trim();

      let host = apiBase;
      if (!host && renderHost) {
        host = `https://${renderHost}`;
      }
      if (!host) {
        if (this.config.get<string>('NODE_ENV') === 'production') {
          throw new InternalServerErrorException(
            'API_BASE_URL hoặc OBJECT_STORAGE_PUBLIC_BASE_URL phải được cấu hình với HTTPS trong production',
          );
        }
        host = `http://localhost:${this.config.get<string>('PORT') || 3001}`;
      }
      baseUrl = `${host.replace(/\/+$/, '')}/api/html-games/public`;
    }

    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(baseUrl);
    } catch {
      throw new InternalServerErrorException(
        'Miền chạy trò chơi HTML phải là một URL HTTP(S) tuyệt đối',
      );
    }
    if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
      throw new InternalServerErrorException(
        'Miền chạy trò chơi HTML phải là một URL HTTP(S) tuyệt đối',
      );
    }
    if (this.config.get<string>('NODE_ENV') === 'production') {
      if (parsedBaseUrl.protocol !== 'https:') {
        throw new InternalServerErrorException(
          'Miền chạy trò chơi HTML phải sử dụng HTTPS trong production',
        );
      }
    }
    const encodedKey = safeKey.split('/').map(encodeURIComponent).join('/');
    return `${baseUrl.replace(/\/+$/, '')}/${encodedKey}`;
  }

  private connection(): { client: S3Client; bucket: string } {
    const bucket = this.config.get<string>('OBJECT_STORAGE_BUCKET')?.trim();
    const accessKeyId = this.config.get<string>('OBJECT_STORAGE_ACCESS_KEY_ID')?.trim();
    const secretAccessKey = this.config.get<string>('OBJECT_STORAGE_SECRET_ACCESS_KEY')?.trim();
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new InternalServerErrorException(
        'Kho lưu trữ đối tượng cho trò chơi HTML chưa được cấu hình',
      );
    }
    if (!this.client) {
      const endpoint = this.config.get<string>('OBJECT_STORAGE_ENDPOINT')?.trim();
      this.client = new S3Client({
        region: this.config.get<string>('OBJECT_STORAGE_REGION')?.trim() || 'auto',
        endpoint: endpoint || undefined,
        forcePathStyle: this.config.get<string>('OBJECT_STORAGE_FORCE_PATH_STYLE') === 'true',
        credentials: { accessKeyId, secretAccessKey },
      });
    }
    return { client: this.client, bucket };
  }

  private assertSafeKey(value: string): string {
    const key = String(value || '').replace(/\\/g, '/');
    const parts = key.split('/');
    if (
      !key ||
      key.startsWith('/') ||
      /^[a-zA-Z]:/.test(key) ||
      parts.some((part) => !part || part === '.' || part === '..' || part.includes('\0'))
    ) {
      throw new InternalServerErrorException('Khóa lưu trữ đối tượng không hợp lệ');
    }
    return key;
  }
}
