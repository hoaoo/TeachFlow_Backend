import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { LessonPlansService } from './lesson-plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';

describe('LessonPlansService (Full Production Spec)', () => {
  let service: LessonPlansService;
  let prisma: any;
  let authService: TeachingAssignmentAuthorizationService;

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
      teachingActivity: {
        create: jest.fn().mockResolvedValue({ id: 'lib-act-1', title: 'Saved Act' }),
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
      ],
    }).compile();

    service = module.get<LessonPlansService>(LessonPlansService);
    authService = module.get<TeachingAssignmentAuthorizationService>(TeachingAssignmentAuthorizationService);
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

  it('links and unlinks schedule to lesson plan with authorization', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);
    jest.spyOn(prisma.schedule, 'findUnique').mockResolvedValue({
      id: 'sched-1',
      teacherId: 'teacher-1',
      deletedAt: null,
    });

    const linkResult = await service.linkSchedule('lp-1', 'sched-1', 'teacher-1');
    expect(linkResult).toBeDefined();
    expect(prisma.schedule.update).toHaveBeenCalledWith({
      where: { id: 'sched-1' },
      data: { lessonPlanId: 'lp-1' },
    });

    const unlinkResult = await service.unlinkSchedule('lp-1', 'sched-1', 'teacher-1');
    expect(unlinkResult).toBeDefined();
    expect(prisma.schedule.update).toHaveBeenCalledWith({
      where: { id: 'sched-1' },
      data: { lessonPlanId: null },
    });
  });

  it('saves activity to personal activity library', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);
    jest.spyOn(prisma.lessonPlanActivity, 'findUnique').mockResolvedValue({
      id: 'act-1',
      lessonPlanId: 'lp-1',
      title: 'Trò chơi hay',
      objective: 'Tạo hứng thú',
      teacherActivity: 'GV hướng dẫn',
      studentActivity: 'HS thực hiện',
      durationMinutes: 10,
      phase: 'Khởi động',
    } as any);

    const result = await service.saveActivityToLibrary(
      'lp-1',
      'act-1',
      { title: 'Trò chơi hay' },
      'teacher-1',
    );

    expect(result.success).toBe(true);
    expect(prisma.teachingActivity.create).toHaveBeenCalled();
  });

  it('retrieves version history and restores previous version', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);
    jest.spyOn(prisma.lessonPlanVersion, 'findUnique').mockResolvedValue({
      id: 'ver-1',
      lessonPlanId: 'lp-1',
      versionNumber: 1,
      contentSnapshot: JSON.stringify({
        title: 'Bản cũ',
        duration: 35,
        activities: [{ phase: 'Khởi động', title: 'Cũ', minutes: 5 }],
      }),
    } as any);

    const versions = await service.getVersions('lp-1', 'teacher-1');
    expect(versions).toBeDefined();
    expect(versions.length).toBe(1);

    const restored = await service.restoreVersion('lp-1', 'ver-1', 'teacher-1');
    expect(restored).toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
