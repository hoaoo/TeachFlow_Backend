import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LessonPlansService } from './lesson-plans.service';
import { PrismaService } from '../prisma/prisma.service';

describe('LessonPlansService (CRUD, Optimistic Concurrency, Duplicate)', () => {
  let service: LessonPlansService;
  let prisma: PrismaService;

  const mockPlan = {
    id: 'lp-1',
    teacherId: 'teacher-1',
    title: 'Phân số bằng nhau',
    subjectName: 'Toán',
    gradeName: 'Lớp 4A',
    teachingDate: new Date('2026-08-21'),
    durationMinutes: 40,
    objectives: 'Mục tiêu bài học',
    status: 'DRAFT',
    version: 1,
    deletedAt: null,
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
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              count: jest.fn(),
            },
            $transaction: jest.fn((cb) => {
              if (typeof cb === 'function') {
                return cb({
                  lessonPlan: {
                    create: jest.fn().mockResolvedValue({ id: 'lp-copy' }),
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
      ],
    }).compile();

    service = module.get<LessonPlansService>(LessonPlansService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('throws 409 Conflict when updating with mismatched version (Optimistic Locking)', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);

    await expect(
      service.update(
        'lp-1',
        {
          title: 'Title updated',
          version: 999,
        },
        'teacher-1',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('allows duplicate in transaction', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);

    const result = await service.duplicate('lp-1', 'teacher-1');
    expect(result).toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('reorders activities', async () => {
    jest.spyOn(prisma.lessonPlan, 'findUnique').mockResolvedValue(mockPlan as any);

    const result = await service.reorderActivities(
      'lp-1',
      { activityIds: ['act-2', 'act-1'] },
      'teacher-1',
    );
    expect(result).toBeDefined();
  });
});
