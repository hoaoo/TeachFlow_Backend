import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import * as fs from 'fs';
import * as path from 'path';

describe('StorageService (Mobile Storage & Presigned URLs)', () => {
  let service: StorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: any) => {
              if (key === 'RESOURCE_UPLOAD_DIR') return 'uploads/test-resources';
              if (key === 'JWT_ACCESS_SECRET') return 'test_secret_key_min_32_characters_long_123456';
              return def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  afterAll(() => {
    const testDir = service.getUploadDir();
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generatePresignedUpload', () => {
    it('generates direct upload URL with fileKey and HMAC token', () => {
      const result = service.generatePresignedUpload(
        {
          fileName: 'bai_hoc.pptx',
          contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          fileSize: 1048576,
        },
        'teacher-123',
        'http://localhost:3001',
      );

      expect(result.method).toBe('PUT');
      expect(result.fileKey).toMatch(/\.pptx$/);
      expect(result.uploadUrl).toContain('http://localhost:3001/api/resources/direct-upload/');
      expect(result.uploadUrl).toContain('?token=');
      expect(result.headers['Content-Type']).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    });

    it('verifies valid upload token', () => {
      const result = service.generatePresignedUpload(
        {
          fileName: 'tailieu.pdf',
          contentType: 'application/pdf',
        },
        'teacher-123',
      );

      const url = new URL(`http://localhost${result.uploadUrl}`);
      const token = url.searchParams.get('token')!;

      const verification = service.verifyUploadToken(result.fileKey, token);
      expect(verification.valid).toBe(true);
      expect(verification.teacherId).toBe('teacher-123');
    });

    it('rejects tampered upload token', () => {
      const verification = service.verifyUploadToken('uuid.pdf', 'invalid-tampered-token');
      expect(verification.valid).toBe(false);
    });
  });

  describe('generateSignedAccessToken', () => {
    it('generates temporary signed GET token with expiry', () => {
      const { token, expiresAt } = service.generateSignedAccessToken('resource-uuid.pdf', 'teacher-123', 3600);
      expect(token).toBeDefined();
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

      const verified = service.verifySignedAccessToken('resource-uuid.pdf', token);
      expect(verified.valid).toBe(true);
      expect(verified.teacherId).toBe('teacher-123');
    });

    it('rejects access when fileKey does not match signed token', () => {
      const { token } = service.generateSignedAccessToken('correct-file.pdf', 'teacher-123');
      const verified = service.verifySignedAccessToken('different-file.pdf', token);
      expect(verified.valid).toBe(false);
    });
  });

  describe('Path Traversal Security', () => {
    it('sanitizes and prevents path traversal in getSafeFilePath', () => {
      const safePath = service.getSafeFilePath('../../etc/passwd.pdf');
      expect(safePath.startsWith(service.getUploadDir())).toBe(true);
      expect(path.basename(safePath)).toBe('passwd.pdf');
    });
  });
});
