import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ForbiddenException, BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { StorageService } from './storage/storage.service';
import { PreviewService } from './preview.service';
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
          provide: PreviewService,
          useValue: {
            processResourcePreview: jest.fn().mockResolvedValue(undefined),
          },
        },
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
    it('should validate and accept valid PDF, DOCX, XLSX, PPTX, TXT, PNG, GIF, MP3, WAV, M4A, AAC, MP4, WEBM, MOV files', () => {
      const testCases = [
        { name: 'bai_giang.pdf', mime: 'application/pdf', type: 'DOCUMENT', ext: '.pdf' },
        { name: 'giao_an.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', type: 'DOCUMENT', ext: '.docx' },
        { name: 'bang_diem.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', type: 'SPREADSHEET', ext: '.xlsx' },
        { name: 'trinh_chieu.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', type: 'PRESENTATION', ext: '.pptx' },
        { name: 'ghi_chu.txt', mime: 'text/plain', type: 'DOCUMENT', ext: '.txt' },
        { name: 'hinh_anh.png', mime: 'image/png', type: 'IMAGE', ext: '.png' },
        { name: 'anh_dong.gif', mime: 'image/gif', type: 'IMAGE', ext: '.gif' },
        { name: 'bai_hat.mp3', mime: 'audio/mpeg', type: 'AUDIO', ext: '.mp3' },
        { name: 'am_thanh.wav', mime: 'audio/wav', type: 'AUDIO', ext: '.wav' },
        { name: 'thu_am.m4a', mime: 'audio/mp4', type: 'AUDIO', ext: '.m4a' },
        { name: 'nhac.aac', mime: 'audio/aac', type: 'AUDIO', ext: '.aac' },
        { name: 'video_tiet_hoc.mp4', mime: 'video/mp4', type: 'VIDEO', ext: '.mp4' },
        { name: 'video_thi_nghiem.webm', mime: 'video/webm', type: 'VIDEO', ext: '.webm' },
        { name: 'clip.mov', mime: 'video/quicktime', type: 'VIDEO', ext: '.mov' },
      ];

      for (const tc of testCases) {
        const file = {
          originalname: tc.name,
          size: 1 * 1024 * 1024,
          mimetype: tc.mime,
        } as any;
        const res = validateUploadedFile(file, 500);
        expect(res.extension).toBe(tc.ext);
        expect(res.resourceType).toBe(tc.type);
      }
    });

    it('should reject dangerous executable / script files', () => {
      const dangerousNames = [
        'malware.exe',
        'script.sh',
        'run.bat',
        'cmd.cmd',
        'powershell.ps1',
        'setup.msi',
        'payload.js',
        'app.com',
        'virus.scr',
      ];

      for (const name of dangerousNames) {
        const file = { originalname: name, size: 1000, mimetype: 'application/octet-stream' } as any;
        expect(() => validateUploadedFile(file)).toThrow(BadRequestException);
      }
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

    it('should prevent other teachers from deleting resource (403 Forbidden)', async () => {
      const otherUser = { userId: 'user-999', email: 'other@test.com', role: 'TEACHER' as const, teacherId: 'teacher-999' };
      await expect(service.remove('res-1', otherUser)).rejects.toThrow(ForbiddenException);
    });
  });
});

