import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';

describe('AssessmentsService (Phase 5 - TeachingAssignment & Authorization)', () => {
  let service: AssessmentsService;
  let prisma: PrismaService;
  let authService: TeachingAssignmentAuthorizationService;

  const mockAssessment = {
    id: 'assess-1',
    teacherId: 'teacher-1',
    teachingAssignmentId: 'asg-1',
    classroomId: 'class-4a',
    subjectId: 'sub-math',
    schoolYearId: 'sy-2026',
    title: 'Đánh giá giữa kỳ I',
    deletedAt: null,
    teachingAssignment: {
      id: 'asg-1',
      teacherId: 'teacher-1',
      classroomId: 'class-4a',
      subjectId: 'sub-math',
      schoolYearId: 'sy-2026',
      isActive: true,
      subject: { id: 'sub-math', name: 'Toán' },
      classroom: { id: 'class-4a', name: 'Lớp 4A', grade: { name: 'Khối 4' } },
      schoolYear: { id: 'sy-2026', name: '2026 - 2027' },
    },
    criteria: [
      { id: 'crit-1', assessmentId: 'assess-1', code: 'READING', name: 'Đọc hiểu' },
    ],
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
            studentEnrollment: {
              findMany: jest.fn(),
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
        {
          provide: TeachingAssignmentAuthorizationService,
          useValue: {
            validateAssignmentForCreate: jest.fn(),
            resolveAssignmentFromContext: jest.fn(),
            assertStudentsEnrolled: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AssessmentsService>(AssessmentsService);
    prisma = module.get<PrismaService>(PrismaService);
    authService = module.get<TeachingAssignmentAuthorizationService>(TeachingAssignmentAuthorizationService);
  });

  it('creates assessment using own active TeachingAssignment', async () => {
    jest.spyOn(authService, 'validateAssignmentForCreate').mockResolvedValue(mockAssessment.teachingAssignment as any);
    jest.spyOn(prisma.assessment, 'create').mockResolvedValue(mockAssessment as any);

    const result = await service.create(
      {
        title: 'Đánh giá giữa kỳ I',
        teachingAssignmentId: 'asg-1',
      },
      'teacher-1',
    );

    expect(authService.validateAssignmentForCreate).toHaveBeenCalledWith('asg-1', 'teacher-1');
    expect(result).toBeDefined();
    expect(result.title).toBe('Đánh giá giữa kỳ I');
  });

  it('rejects creation when teacher attempts to use other teacher assignment (IDOR)', async () => {
    jest.spyOn(authService, 'validateAssignmentForCreate').mockRejectedValue(
      new ForbiddenException('Bạn không có quyền sử dụng phân công giảng dạy của giáo viên khác'),
    );

    await expect(
      service.create(
        {
          title: 'Đánh giá giữa kỳ I',
          teachingAssignmentId: 'asg-other',
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
          title: 'Đánh giá giữa kỳ I',
          teachingAssignmentId: 'asg-inactive',
        },
        'teacher-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects student assessment if student is not enrolled in class (Student Cross-Class IDOR)', async () => {
    jest.spyOn(prisma.assessment, 'findUnique').mockResolvedValue(mockAssessment as any);
    jest.spyOn(authService, 'assertStudentsEnrolled').mockRejectedValue(
      new BadRequestException('Học sinh với mã student-999 không thuộc danh sách lớp học này'),
    );

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

  it('rejects invalid score values outside 0-10 range', async () => {
    jest.spyOn(prisma.assessment, 'findUnique').mockResolvedValue(mockAssessment as any);

    await expect(
      service.bulkUpdateStudents(
        'assess-1',
        {
          assessments: [{ studentId: 'student-1', score: 15.0 }],
        },
        'teacher-1',
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.bulkUpdateStudents(
        'assess-1',
        {
          assessments: [{ studentId: 'student-1', score: -1.0 }],
        },
        'teacher-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects nested criterion ID that does not belong to this assessment (Nested Resource IDOR)', async () => {
    jest.spyOn(prisma.assessment, 'findUnique').mockResolvedValue(mockAssessment as any);

    await expect(
      service.bulkUpdateStudents(
        'assess-1',
        {
          assessments: [{ studentId: 'student-1', criterionId: 'crit-belonging-to-other-assessment', score: 9.0 }],
        },
        'teacher-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects if teacher does not own the assessment (IDOR)', async () => {
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
    jest.spyOn(authService, 'assertStudentsEnrolled').mockResolvedValue(undefined as any);

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
