import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { LessonPlansService } from './lesson-plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';

describe('LessonPlansService (Phase 5 - TeachingAssignment & Authorization)', () => {
  let service: LessonPlansService;
  let prisma: PrismaService;
  let authService: TeachingAssignmentAuthorizationService;

  const mockPlan = {
    id: 'lp-1',
    teacherId: 'teacher-1',
    teachingAssignmentId: 'asg-1',
    title: 'Phân số bằng nhau',
    subjectName: 'Toán',
    gradeName: 'Lớp 4A',
    teachingDate: new Date('2026-08-21'),
    durationMinutes: 40,
    objectives: 'Mục tiêu bài học',
    status: 'DRAFT',
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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LessonPlansService,
        {
          provide: PrismaService,
          useValue: {
            lessonPlan: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            lessonPlanActivity: {
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              count: jest.fn(),
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
                    findUnique: jest.fn().mockResolvedValue(mockPlan),
                  },
                  lessonPlanActivity: {
                    deleteMany: jest.fn(),
                    create: jest.fn(),
                    updateMany: jest.fn(),
                  },
                });
              }
              return Promise.all(cb);
            }),
          },
        },
        {
          provide: TeachingAssignmentAuthorizationService,
          useValue: {
            validateAssignmentForCreate: jest.fn(),
            resolveAssignmentFromContext: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LessonPlansService>(LessonPlansService);
    prisma = module.get<PrismaService>(PrismaService);
    authService = module.get<TeachingAssignmentAuthorizationService>(TeachingAssignmentAuthorizationService);
  });

  it('creates lesson plan using own active TeachingAssignment', async () => {
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

  it('rejects creation when assignment is inactive', async () => {
    jest.spyOn(authService, 'validateAssignmentForCreate').mockRejectedValue(
      new BadRequestException('Phân công giảng dạy này đã bị vô hiệu hóa'),
    );

    await expect(
      service.create(
        {
          title: 'Phân số bằng nhau',
          teachingAssignmentId: 'asg-inactive',
        },
        'teacher-1',
      ),
    ).rejects.toThrow(BadRequestException);
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
});
