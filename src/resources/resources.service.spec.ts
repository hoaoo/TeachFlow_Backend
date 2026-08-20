import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ForbiddenException, BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { StorageService } from './storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { validateUploadedFile } from './resources.validator';

describe('ResourcesService & File Validator', () => {
  let service: ResourcesService;
  let storageService: StorageService;
  let prismaService: PrismaService;

  const mockTeacher = {
    id: 'teacher-123',
    userId: 'user-123',
    fullName: 'Cô Nguyễn Hà',
  };

  const mockResource = {
    id: 'res-1',
    teacherId: 'teacher-123',
    name: 'Tài liệu Tiếng Việt',
    title: 'Tài liệu Tiếng Việt',
    originalFileName: 'tieng_viet_4.pdf',
    storedFileName: 'uuid-123.pdf',
    mimeType: 'application/pdf',
    size: 102400,
    resourceType: 'DOCUMENT',
    storagePath: '/uploads/resources/uuid-123.pdf',
    deletedAt: null,
    subject: { name: 'Tiếng Việt' },
    grade: { name: 'Khối 4' },
    lesson: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourcesService,
        {
          provide: StorageService,
          useValue: {
            saveFile: jest.fn().mockResolvedValue({
              storedFileName: 'uuid-123.pdf',
              storagePath: '/uploads/resources/uuid-123.pdf',
              size: 102400,
            }),
            fileExists: jest.fn().mockResolvedValue(true),
            getSafeFilePath: jest.fn().mockReturnValue('/uploads/resources/uuid-123.pdf'),
            deleteFile: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'RESOURCE_MAX_FILE_SIZE_MB') return '25';
              return null;
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            teacher: {
              findUnique: jest.fn().mockResolvedValue(mockTeacher),
            },
            teachingResource: {
              create: jest.fn().mockResolvedValue(mockResource),
              findMany: jest.fn().mockResolvedValue([mockResource]),
              findUnique: jest.fn().mockImplementation(({ where }) => {
                if (where.id === 'res-1') return Promise.resolve(mockResource);
                if (where.id === 'res-deleted') return Promise.resolve({ ...mockResource, deletedAt: new Date() });
                return Promise.resolve(null);
              }),
              update: jest.fn().mockResolvedValue(mockResource),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ResourcesService>(ResourcesService);
    storageService = module.get<StorageService>(StorageService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('File Validation & Security', () => {
    it('should validate and accept valid PDF, DOCX, PNG, MP4 files', () => {
      const pdfFile = {
        originalname: 'bai_giang.pdf',
        size: 5 * 1024 * 1024,
        mimetype: 'application/pdf',
      } as any;
      const resPdf = validateUploadedFile(pdfFile, 25);
      expect(resPdf.extension).toBe('.pdf');
      expect(resPdf.resourceType).toBe('DOCUMENT');

      const docxFile = {
        originalname: 'giao_an.docx',
        size: 2 * 1024 * 1024,
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      } as any;
      const resDocx = validateUploadedFile(docxFile, 25);
      expect(resDocx.extension).toBe('.docx');
      expect(resDocx.resourceType).toBe('DOCUMENT');

      const pngFile = {
        originalname: 'hinh_anh.png',
        size: 1 * 1024 * 1024,
        mimetype: 'image/png',
      } as any;
      const resPng = validateUploadedFile(pngFile, 25);
      expect(resPng.extension).toBe('.png');
      expect(resPng.resourceType).toBe('IMAGE');
    });

    it('should reject dangerous executable / script files', () => {
      const exeFile = { originalname: 'malware.exe', size: 1000, mimetype: 'application/x-msdownload' } as any;
      expect(() => validateUploadedFile(exeFile)).toThrow(BadRequestException);

      const shFile = { originalname: 'script.sh', size: 1000, mimetype: 'text/x-shellscript' } as any;
      expect(() => validateUploadedFile(shFile)).toThrow(BadRequestException);

      const batFile = { originalname: 'run.bat', size: 1000, mimetype: 'application/x-bat' } as any;
      expect(() => validateUploadedFile(batFile)).toThrow(BadRequestException);

      const jsFile = { originalname: 'payload.js', size: 1000, mimetype: 'application/javascript' } as any;
      expect(() => validateUploadedFile(jsFile)).toThrow(BadRequestException);
    });

    it('should reject files exceeding max allowed size', () => {
      const largeFile = {
        originalname: 'huge_video.mp4',
        size: 30 * 1024 * 1024, // 30MB > 25MB
        mimetype: 'video/mp4',
      } as any;
      expect(() => validateUploadedFile(largeFile, 25)).toThrow(PayloadTooLargeException);
    });

    it('should sanitize path traversal attempts in original filename', () => {
      const traversalFile = {
        originalname: '../../../../etc/shadow.pdf',
        size: 1024,
        mimetype: 'application/pdf',
      } as any;
      const res = validateUploadedFile(traversalFile, 25);
      expect(res.sanitizedOriginalName).not.toContain('..');
      expect(res.sanitizedOriginalName).toBe('shadow.pdf');
    });
  });

  describe('Upload & Download Operations', () => {
    it('should upload file and save metadata', async () => {
      const mockFile = {
        originalname: 'tieng_viet_4.pdf',
        size: 102400,
        mimetype: 'application/pdf',
        buffer: Buffer.from('test pdf content'),
      } as any;

      const authUser = { userId: 'user-123', email: 'teacher@test.com', role: 'TEACHER' as const, teacherId: 'teacher-123' };
      const res = await service.uploadResource(mockFile, { name: 'Tài liệu Tiếng Việt 4' }, authUser);

      expect(res.id).toBe('res-1');
      expect(storageService.saveFile).toHaveBeenCalled();
    });

    it('should allow owner teacher to get file for download', async () => {
      const authUser = { userId: 'user-123', email: 'teacher@test.com', role: 'TEACHER' as const, teacherId: 'teacher-123' };
      const fileInfo = await service.getFileForDownload('res-1', authUser);

      expect(fileInfo.filePath).toBe('/uploads/resources/uuid-123.pdf');
      expect(fileInfo.mimeType).toBe('application/pdf');
    });

    it('should prevent other teachers from downloading resource (403 Forbidden)', async () => {
      const otherUser = { userId: 'user-999', email: 'other@test.com', role: 'TEACHER' as const, teacherId: 'teacher-999' };
      await expect(service.getFileForDownload('res-1', otherUser)).rejects.toThrow(ForbiddenException);
    });
  });
});
