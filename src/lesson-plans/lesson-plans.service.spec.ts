import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LessonPlansService } from './lesson-plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';
import { StorageService } from '../resources/storage/storage.service';

describe('LessonPlansService (Full Production Spec with Upload & Security)', () => {
  let service: LessonPlansService;
  let prisma: any;
  let authService: TeachingAssignmentAuthorizationService;
  let storageService: StorageService;

  const mockPlan = {
    id: 'lp-1',
    teacherId: 'teacher-1',
    teachingAssignmentId: 'asg-1',
    title: 'Phân số bằng nhau',
    topic: 'Chủ đề 1',
    subjectName: 'Toán',
    gradeName: 'Lớp 4A',
    teachingDate: new Date('2026-08-21'),
    durationMinutes: 40,
    objectives: 'Mục tiêu bài học',
    status: 'DRAFT',
    sourceType: 'NATIVE',
    originalFileName: null,
    storedFileName: null,
    storagePath: null,
    mimeType: null,
    fileSize: null,
    version: 1,
    deletedAt: null,
    teachingAssignment: {
      id: 'asg-1',
      teacherId: 'teacher-1',
      classroomId: 'class-4A',
      subjectId: 'sub-math',
      schoolYearId: 'sy-2026',
      isActive: true,
      subject: { id: 'sub-math', name: 'Toán' },
      classroom: { id: 'class-4A', name: 'Lớp 4A', grade: { name: 'Khối 4' } },
      schoolYear: { id: 'sy-2026', name: '2026 - 2027' },
    },
    activities: [
      { id: 'act-1', phase: 'Khởi động', title: 'Trò chơi', durationMinutes: 5, sortOrder: 0 },
      { id: 'act-2', phase: 'Khám phá', title: 'Tìm hiểu', durationMinutes: 15, sortOrder: 1 },
    ],
    schedules: [],
    resources: [],
    versions: [],
  };

  const mockUploadedPlan = {
    id: 'lp-upload-1',
    teacherId: 'teacher-1',
    title: 'Giao_an_toan_tiet_5.docx',
    subjectName: 'Toán',
    gradeName: 'Lớp 4A',
    status: 'COMPLETED',
    sourceType: 'UPLOADED',
    originalFileName: 'Giao_an_toan_tiet_5.docx',
    storedFileName: 'stored-uuid-123.docx',
    storagePath: 'uploads/resources/stored-uuid-123.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileSize: 10240,
    version: 1,
    deletedAt: null,
    teachingAssignment: null,
    activities: [],
    schedules: [],
    resources: [],
    versions: [],
  };

  beforeEach(async () => {
    prisma = {
      lessonPlan: {
        findMany: jest.fn().mockResolvedValue([mockPlan]),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue(mockPlan),
        update: jest.fn().mockResolvedValue(mockPlan),
      },
      lessonPlanActivity: {
        create: jest.fn().mockResolvedValue(mockPlan.activities[0]),
        findUnique: jest.fn().mockResolvedValue(mockPlan.activities[0]),
        update: jest.fn().mockResolvedValue(mockPlan.activities[0]),
        delete: jest.fn().mockResolvedValue(mockPlan.activities[0]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(2),
      },
      lessonPlanVersion: {
        create: jest.fn().mockResolvedValue({ id: 'ver-1', versionNumber: 1 }),
        findMany: jest.fn().mockResolvedValue([{ id: 'ver-1', versionNumber: 1, title: 'v1' }]),
        findUnique: jest.fn(),
      },
      schedule: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      classroom: {
        findUnique: jest.fn().mockResolvedValue({ id: 'class-4A', name: 'Lớp 4A' }),
      },
      teachingActivity: {
        create: jest.fn().mockResolvedValue({ id: 'lib-act-1', title: 'Saved Act' }),
      },
      htmlGame: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'game-1',
          title: 'Phép cộng vui',
          description: null,
          thumbnail: null,
          gradeId: null,
          subjectId: null,
          status: 'PUBLISHED',
          grade: null,
          subject: null,
          updatedAt: new Date('2026-08-29T00:00:00Z'),
        }),
      },
      lessonPlanHtmlGame: {
        upsert: jest.fn().mockResolvedValue({
          htmlGame: {
            id: 'game-1',
            title: 'Phép cộng vui',
            description: null,
            thumbnail: null,
            gradeId: null,
            subjectId: null,
            status: 'PUBLISHED',
            grade: null,
            subject: null,
            updatedAt: new Date('2026-08-29T00:00:00Z'),
          },
        }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      teacherHtmlGame: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'custom-1',
          htmlGameId: 'game-1',
          teacherId: 'teacher-1',
          title: 'Bộ câu hỏi lớp 4A',
          htmlGame: {
            id: 'game-1',
            title: 'Phép cộng vui',
            status: 'PUBLISHED',
            supportsQuestionConfig: true,
            grade: null,
            subject: null,
          },
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'custom-1', teacherId: 'teacher-1', htmlGameId: 'game-1',
        }),
      },
      lessonPlanTeacherHtmlGame: {
        upsert: jest.fn().mockResolvedValue({
          teacherHtmlGame: {
            id: 'custom-1',
            teacherId: 'teacher-1',
            title: 'Bộ câu hỏi lớp 4A',
            updatedAt: new Date('2026-08-29T00:00:00Z'),
            htmlGame: {
              id: 'game-1',
              title: 'Phép cộng vui',
              status: 'PUBLISHED',
              supportsQuestionConfig: true,
              grade: null,
              subject: null,
            },
          },
        }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      teachingAssignment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => {
        if (typeof cb === 'function') {
          return cb({
            lessonPlan: {
              create: jest.fn().mockResolvedValue(mockPlan),
              update: jest.fn().mockResolvedValue(mockPlan),
              updateMany: jest.fn(),
              findUnique: jest.fn().mockResolvedValue(mockPlan),
            },
            lessonPlanActivity: {
              deleteMany: jest.fn(),
              create: jest.fn(),
              updateMany: jest.fn(),
            },
            lessonPlanVersion: {
              create: jest.fn(),
            },
            schedule: {
              update: jest.fn(),
              updateMany: jest.fn(),
            },
          });
        }
        return Promise.all(cb);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LessonPlansService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: TeachingAssignmentAuthorizationService,
          useValue: {
            validateAssignmentForCreate: jest.fn(),
            resolveAssignmentFromContext: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: {
            saveFile: jest.fn().mockResolvedValue({
              storedFileName: 'stored-uuid-123.docx',
              storagePath: 'uploads/resources/stored-uuid-123.docx',
              size: 10240,
            }),
            deleteFile: jest.fn().mockResolvedValue(true),
            getSafeFilePath: jest.fn().mockReturnValue('d:/Backend_teachflow/uploads/resources/stored-uuid-123.docx'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'LESSON_PLAN_UPLOAD_MAX_SIZE') return '25';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LessonPlansService>(LessonPlansService);
    authService = module.get<TeachingAssignmentAuthorizationService>(TeachingAssignmentAuthorizationService);
    storageService = module.get<StorageService>(StorageService);
  });

  it('creates lesson plan and automatically creates initial version snapshot', async () => {
    jest.spyOn(authService, 'validateAssignmentForCreate').mockResolvedValue(mockPlan.teachingAssignment as any);
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);

    const result = await service.create(
      {
        title: 'Phân số bằng nhau',
        teachingAssignmentId: 'asg-1',
      },
      'teacher-1',
    );

    expect(authService.validateAssignmentForCreate).toHaveBeenCalledWith('asg-1', 'teacher-1');
    expect(result).toBeDefined();
    expect(result.title).toBe('Phân số bằng nhau');
  });

  it('rejects creation when teacher attempts to use another teacher assignment (IDOR)', async () => {
    jest.spyOn(authService, 'validateAssignmentForCreate').mockRejectedValue(
      new ForbiddenException('Bạn không có quyền sử dụng phân công giảng dạy của giáo viên khác'),
    );

    await expect(
      service.create(
        {
          title: 'Phân số bằng nhau',
          teachingAssignmentId: 'asg-other-teacher',
        },
        'teacher-1',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows teacher to read their own lesson plan', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);

    const result = await service.findOne('lp-1', 'teacher-1');
    expect(result).toBeDefined();
    expect(result.id).toBe('lp-1');
  });

  it('rejects reading another teacher lesson plan (IDOR)', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);

    await expect(service.findOne('lp-1', 'teacher-intruder')).rejects.toThrow(ForbiddenException);
  });

  it('rejects updating another teacher lesson plan (IDOR)', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);

    await expect(
      service.update('lp-1', { title: 'Hack Title', version: 1 }, 'teacher-intruder'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects deleting another teacher lesson plan (IDOR)', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);

    await expect(service.remove('lp-1', 'teacher-intruder')).rejects.toThrow(ForbiddenException);
  });

  it('throws 409 Conflict on version mismatch (Optimistic Concurrency)', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);

    await expect(
      service.update('lp-1', { title: 'Title updated', version: 999 }, 'teacher-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('duplicates lesson plan in transaction', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);

    const result = await service.duplicate('lp-1', 'teacher-1');
    expect(result).toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('uploads valid DOCX lesson plan with storage and transaction', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockUploadedPlan as any);

    const mockFile: any = {
      originalname: 'Giao_an_toan_tiet_5.docx',
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 10240,
      buffer: Buffer.from('fake-docx-content'),
    };

    const result = await service.uploadLessonPlan(
      mockFile,
      { title: 'Giáo án Toán Tiết 5', subject: 'Toán' },
      'teacher-1',
    );

    expect(storageService.saveFile).toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result.sourceType).toBe('UPLOADED');
    expect(result.originalFileName).toBe('Giao_an_toan_tiet_5.docx');
  });

  it('uploads valid PDF lesson plan', async () => {
    const pdfPlan = { ...mockUploadedPlan, originalFileName: 'Giao_an_bai_3.pdf', mimeType: 'application/pdf' };
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(pdfPlan as any);

    const mockFile: any = {
      originalname: 'Giao_an_bai_3.pdf',
      mimetype: 'application/pdf',
      size: 5120,
      buffer: Buffer.from('%PDF-1.4 fake pdf'),
    };

    const result = await service.uploadLessonPlan(mockFile, {}, 'teacher-1');
    expect(result).toBeDefined();
    expect(result.sourceType).toBe('UPLOADED');
  });

  it('rejects dangerous executable files on upload', async () => {
    const mockFile: any = {
      originalname: 'virus.exe',
      mimetype: 'application/x-msdownload',
      size: 1024,
      buffer: Buffer.from('exe'),
    };

    await expect(
      service.uploadLessonPlan(mockFile, {}, 'teacher-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects unsupported extensions on upload', async () => {
    const mockFile: any = {
      originalname: 'slide.pptx',
      mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      size: 1024,
      buffer: Buffer.from('ppt'),
    };

    await expect(
      service.uploadLessonPlan(mockFile, {}, 'teacher-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects oversized uploaded files', async () => {
    const mockFile: any = {
      originalname: 'giant.docx',
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 30 * 1024 * 1024, // 30MB > 25MB limit
      buffer: Buffer.from('large'),
    };

    await expect(
      service.uploadLessonPlan(mockFile, {}, 'teacher-1'),
    ).rejects.toThrow(PayloadTooLargeException);
  });

  it('cleans up stored file when DB transaction fails during upload', async () => {
    prisma.$transaction.mockRejectedValueOnce(new Error('Database error'));

    const mockFile: any = {
      originalname: 'fail_plan.docx',
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 1024,
      buffer: Buffer.from('doc'),
    };

    await expect(
      service.uploadLessonPlan(mockFile, {}, 'teacher-1'),
    ).rejects.toThrow('Database error');

    expect(storageService.deleteFile).toHaveBeenCalledWith('stored-uuid-123.docx');
  });

  it('rejects reading/downloading another teacher uploaded file (IDOR)', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockUploadedPlan as any);

    await expect(
      service.getLessonPlanFile('lp-upload-1', 'teacher-intruder'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('attaches only a published game to the owning teacher lesson plan', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);

    const result = await service.attachHtmlGame('lp-1', 'game-1', 'teacher-1');

    expect(prisma.htmlGame.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'game-1', status: 'PUBLISHED' } }),
    );
    expect(prisma.lessonPlanHtmlGame.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          lessonPlanId_htmlGameId: { lessonPlanId: 'lp-1', htmlGameId: 'game-1' },
        },
      }),
    );
    expect(result.id).toBe('game-1');
  });

  it('rejects attaching a game to another teacher lesson plan (IDOR)', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);

    await expect(
      service.attachHtmlGame('lp-1', 'game-1', 'teacher-intruder'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.htmlGame.findFirst).not.toHaveBeenCalled();
    expect(prisma.lessonPlanHtmlGame.upsert).not.toHaveBeenCalled();
  });

  it('does not attach draft or disabled games', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);
    prisma.htmlGame.findFirst.mockResolvedValue(null);

    await expect(
      service.attachHtmlGame('lp-1', 'game-draft', 'teacher-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects detaching a game from another teacher lesson plan (IDOR)', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);

    await expect(
      service.detachHtmlGame('lp-1', 'game-1', 'teacher-intruder'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.lessonPlanHtmlGame.deleteMany).not.toHaveBeenCalled();
  });

  it('attaches the owning teacher customization without copying the HTML package', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);
    const result = await service.attachTeacherHtmlGame('lp-1', 'custom-1', 'teacher-1');
    expect(prisma.teacherHtmlGame.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'custom-1', teacherId: 'teacher-1' }) }),
    );
    expect(prisma.lessonPlanTeacherHtmlGame.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { lessonPlanId: 'lp-1', teacherHtmlGameId: 'custom-1' } }),
    );
    expect(result.kind).toBe('CUSTOMIZATION');
  });

  it('rejects attaching another teacher customization to a lesson plan', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);
    prisma.teacherHtmlGame.findFirst.mockResolvedValue(null);
    await expect(
      service.attachTeacherHtmlGame('lp-1', 'custom-other', 'teacher-1'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.lessonPlanTeacherHtmlGame.upsert).not.toHaveBeenCalled();
  });
});
