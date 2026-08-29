import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ObjectStorageUpload {
  key: string;
  body: Buffer;
  contentType: string;
}

@Injectable()
export class ObjectStorageService {
  private client?: S3Client;

  constructor(private readonly config: ConfigService) {}

  async putObject(file: ObjectStorageUpload): Promise<void> {
    const key = this.assertSafeKey(file.key);
    const { client, bucket } = this.connection();
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.body,
      ContentType: file.contentType,
      CacheControl: 'no-store',
    }));
  }

  async objectExists(key: string): Promise<boolean> {
    const safeKey = this.assertSafeKey(key);
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

  async deletePrefix(prefix: string): Promise<void> {
    const safePrefix = this.assertSafeKey(prefix).replace(/\/+$/, '') + '/';
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
  }

  getPublicUrl(key: string): string {
    const safeKey = this.assertSafeKey(key);
    const baseUrl = this.config.get<string>('OBJECT_STORAGE_PUBLIC_BASE_URL')?.trim();
    if (!baseUrl) {
      throw new InternalServerErrorException(
        'OBJECT_STORAGE_PUBLIC_BASE_URL chưa được cấu hình cho miền chạy trò chơi',
      );
    }
    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(baseUrl);
    } catch {
      throw new InternalServerErrorException(
        'OBJECT_STORAGE_PUBLIC_BASE_URL phải là một URL HTTP(S) tuyệt đối',
      );
    }
    if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
      throw new InternalServerErrorException(
        'OBJECT_STORAGE_PUBLIC_BASE_URL phải là một URL HTTP(S) tuyệt đối',
      );
    }
    if (this.config.get<string>('NODE_ENV') === 'production') {
      if (parsedBaseUrl.protocol !== 'https:') {
        throw new InternalServerErrorException(
          'Miền chạy trò chơi HTML phải sử dụng HTTPS trong production',
        );
      }
      const applicationOrigins = [
        this.config.get<string>('FRONTEND_URL'),
        this.config.get<string>('API_BASE_URL'),
      ]
        .flatMap((value) => String(value || '').split(','))
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => {
          try {
            return new URL(value).origin;
          } catch {
            return null;
          }
        });
      if (applicationOrigins.includes(parsedBaseUrl.origin)) {
        throw new InternalServerErrorException(
          'Miền chạy trò chơi HTML phải tách biệt với miền ứng dụng và API',
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
