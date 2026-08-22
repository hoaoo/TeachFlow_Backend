import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActivityLibraryService } from './activity-library.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ActivityLibraryService (Full Production Spec)', () => {
  let service: ActivityLibraryService;
  let prisma: any;

  const mockActivity = {
    id: 'act-1',
    teacherId: 'teacher-1',
    title: 'Bingo phân số',
    typeName: 'Trò chơi',
    subjectName: 'Toán',
    gradeName: 'Lớp 4',
    durationMinutes: 10,
    objective: 'Củng cố kiến thức',
    method: 'Trò chơi học tập',
    technique: 'Tia chớp',
    competencies: 'Tư duy logic',
    qualities: 'Chăm chỉ',
    equipment: 'Bảng bingo',
    teacherActivity: 'GV quay số',
    studentActivity: 'HS đánh dấu ô',
    gameRules: '3 ô thẳng hàng là thắng',
    questionsJson: null,
    description: 'Trò chơi hay',
    icon: 'Grid2X2',
    usesCount: 5,
    isPublic: true,
    isSystem: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSystemActivity = {
    ...mockActivity,
    id: 'sys-act-1',
    teacherId: null,
    isSystem: true,
  };

  const mockLessonPlan = {
    id: 'lp-1',
    teacherId: 'teacher-1',
    title: 'Bài 1: Phân số',
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      teachingActivity: {
        findMany: jest.fn().mockResolvedValue([mockActivity]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue(mockActivity),
        update: jest.fn().mockResolvedValue(mockActivity),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      lessonPlan: {
        findUnique: jest.fn().mockResolvedValue(mockLessonPlan),
      },
      lessonPlanActivity: {
        create: jest.fn().mockResolvedValue({
          id: 'lpa-1',
          lessonPlanId: 'lp-1',
          phase: 'Trò chơi',
          title: 'Bingo phân số',
          durationMinutes: 10,
          sortOrder: 0,
        }),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((cb) => {
        if (typeof cb === 'function') {
          return cb({
            lessonPlanActivity: {
              create: jest.fn().mockResolvedValue({
                id: 'lpa-1',
                lessonPlanId: 'lp-1',
                phase: 'Trò chơi',
                title: 'Bingo phân số',
                durationMinutes: 10,
                sortOrder: 0,
              }),
              count: jest.fn().mockResolvedValue(0),
            },
            teachingActivity: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
          });
        }
        return Promise.all(cb);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityLibraryService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<ActivityLibraryService>(ActivityLibraryService);
  });

  it('creates activity for authenticated teacher', async () => {
    const result = await service.create(
      {
        title: 'Trò chơi mới',
        subject: 'Toán',
        grade: 'Lớp 4',
        type: 'Trò chơi',
        durationMinutes: 15,
      },
      'teacher-1',
    );

    expect(result).toBeDefined();
    expect(prisma.teachingActivity.create).toHaveBeenCalled();
  });

  it('finds activities with search and scope filters', async () => {
    const result = await service.findAll(
      { keyword: 'Bingo', subject: 'Toán', scope: 'MINE' },
      'teacher-1',
    );

    expect(result.items).toBeDefined();
    expect(result.total).toBe(1);
  });

  it('updates own activity successfully', async () => {
    jest.spyOn(prisma.teachingActivity, 'findUnique').mockResolvedValue(mockActivity as any);

    const result = await service.update(
      'act-1',
      { title: 'Bingo phân số mở rộng' },
      'teacher-1',
    );

    expect(result).toBeDefined();
    expect(prisma.teachingActivity.update).toHaveBeenCalled();
  });

  it('rejects updating another teacher activity (IDOR)', async () => {
    jest.spyOn(prisma.teachingActivity, 'findUnique').mockResolvedValue(mockActivity as any);

    await expect(
      service.update('act-1', { title: 'Hack' }, 'teacher-intruder'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects updating system activity', async () => {
    jest.spyOn(prisma.teachingActivity, 'findUnique').mockResolvedValue(mockSystemActivity as any);

    await expect(
      service.update('sys-act-1', { title: 'Hack System' }, 'teacher-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects deleting another teacher activity (IDOR)', async () => {
    jest.spyOn(prisma.teachingActivity, 'findUnique').mockResolvedValue(mockActivity as any);

    await expect(
      service.remove('act-1', 'teacher-intruder'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('duplicates activity into an independent copy', async () => {
    jest.spyOn(prisma.teachingActivity, 'findUnique').mockResolvedValue(mockActivity as any);

    const result = await service.duplicate('act-1', 'teacher-1');
    expect(result).toBeDefined();
    expect(prisma.teachingActivity.create).toHaveBeenCalled();
  });

  it('copies activity snapshot into lesson plan and increments usesCount', async () => {
    jest.spyOn(prisma.teachingActivity, 'findUnique').mockResolvedValue(mockActivity as any);

    const result = await service.addToLessonPlan('act-1', 'lp-1', 'teacher-1');
    expect(result).toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rejects adding activity to another teacher lesson plan (IDOR)', async () => {
    jest.spyOn(prisma.teachingActivity, 'findUnique').mockResolvedValue(mockActivity as any);
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue({
      id: 'lp-other',
      teacherId: 'teacher-other',
    } as any);

    await expect(
      service.addToLessonPlan('act-1', 'lp-other', 'teacher-1'),
    ).rejects.toThrow(ForbiddenException);
  });
});
