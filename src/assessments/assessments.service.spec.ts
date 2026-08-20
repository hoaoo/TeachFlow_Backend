import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AssessmentsService (Bulk Atomic Update & Class Scope)', () => {
  let service: AssessmentsService;
  let prisma: PrismaService;

  const mockAssessment = {
    id: 'assess-1',
    teacherId: 'teacher-1',
    deletedAt: null,
    classroom: {
      id: 'class-4a',
      classStudents: [
        { studentId: 'student-1' },
        { studentId: 'student-2' },
      ],
    },
    criteria: [],
    studentAssessments: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssessmentsService,
        {
          provide: PrismaService,
          useValue: {
            assessment: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            studentAssessment: {
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            $transaction: jest.fn((cb) =>
              cb({
                studentAssessment: {
                  findFirst: jest.fn().mockResolvedValue(null),
                  create: jest.fn().mockResolvedValue({ id: 'sa-1' }),
                  update: jest.fn(),
                },
              }),
            ),
          },
        },
      ],
    }).compile();

    service = module.get<AssessmentsService>(AssessmentsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('rejects student assessment if student is not in the class', async () => {
    jest.spyOn(prisma.assessment, 'findUnique').mockResolvedValue(mockAssessment as any);

    await expect(
      service.bulkUpdateStudents(
        'assess-1',
        {
          assessments: [
            { studentId: 'student-999-invalid', score: 9.0 },
          ],
        },
        'teacher-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects if teacher does not own the assessment', async () => {
    jest.spyOn(prisma.assessment, 'findUnique').mockResolvedValue(mockAssessment as any);

    await expect(
      service.bulkUpdateStudents(
        'assess-1',
        {
          assessments: [{ studentId: 'student-1', score: 9.0 }],
        },
        'other-teacher',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('bulk updates in atomic transaction when valid', async () => {
    jest.spyOn(prisma.assessment, 'findUnique').mockResolvedValue(mockAssessment as any);

    const result = await service.bulkUpdateStudents(
      'assess-1',
      {
        assessments: [
          { studentId: 'student-1', score: 9.5, comment: 'Hoàn thành tốt' },
          { studentId: 'student-2', score: 8.5, comment: 'Đạt yêu cầu' },
        ],
      },
      'teacher-1',
    );

    expect(result.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
