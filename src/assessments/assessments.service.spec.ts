import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';
import { AcademicCalculationService } from './academic-calculation.service';
import { AuditService } from '../common/audit/audit.service';

describe('AssessmentsService (Gradebook, Calculation & Batch Scores)', () => {
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
    semester: 1,
    title: 'Kiểm tra TX1',
    subtitle: 'Toán · Lớp 4A',
    status: 'IN_PROGRESS',
    meta: JSON.stringify({ type: 'THUONG_XUYEN', weight: 1 }),
    tone: 'teal',
    version: 1,
    assessmentDate: new Date('2026-08-20'),
    deletedAt: null,
    subject: { id: 'sub-math', name: 'Toán' },
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
    criteria: [],
    studentAssessments: [
      { id: 'sa-1', assessmentId: 'assess-1', studentId: 'student-1', score: 8.5, level: 'EXCELLENT', comment: 'Tốt' },
    ],
  };

  const mockClassroom = {
    id: 'class-4a',
    name: 'Lớp 4A',
    teacherId: 'teacher-1',
    schoolYearId: 'sy-2026',
    deletedAt: null,
    grade: { name: 'Khối 4' },
    schoolYear: { name: '2026 - 2027' },
  };

  const mockStudents = [
    { id: 'student-1', studentCode: 'HS0001', fullName: 'Nguyễn Văn A', initials: 'VA', gender: 'MALE', deletedAt: null },
    { id: 'student-2', studentCode: 'HS0002', fullName: 'Trần Thị B', initials: 'TB', gender: 'FEMALE', deletedAt: null },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssessmentsService,
        AcademicCalculationService,
        {
          provide: PrismaService,
          useValue: {
            assessment: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            classroom: {
              findMany: jest.fn().mockResolvedValue([{ id: 'class-4a' }]),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
            },
            teachingAssignment: {
              findMany: jest.fn().mockResolvedValue([{ classroomId: 'class-4a' }]),
              count: jest.fn().mockResolvedValue(1),
            },
            student: {
              findUnique: jest.fn(),
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
        {
          provide: AuditService,
          useValue: {
            log: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AssessmentsService>(AssessmentsService);
    prisma = module.get<PrismaService>(PrismaService);
    authService = module.get<TeachingAssignmentAuthorizationService>(TeachingAssignmentAuthorizationService);
  });

  describe('create', () => {
    it('creates assessment using own active TeachingAssignment', async () => {
      jest.spyOn(authService, 'validateAssignmentForCreate').mockResolvedValue(mockAssessment.teachingAssignment as any);
      jest.spyOn(prisma.assessment, 'create').mockResolvedValue(mockAssessment as any);

      const result = await service.create(
        {
          title: 'Kiểm tra TX1',
          teachingAssignmentId: 'asg-1',
          semester: 1,
        },
        'teacher-1',
      );

      expect(authService.validateAssignmentForCreate).toHaveBeenCalledWith('asg-1', 'teacher-1');
      expect(result).toBeDefined();
      expect(result.title).toBe('Kiểm tra TX1');
    });

    it('rejects duplicate assessment title in same classroom and semester', async () => {
      jest.spyOn(prisma.classroom, 'findUnique').mockResolvedValue(mockClassroom as any);
      jest.spyOn(prisma.assessment, 'findFirst').mockResolvedValue(mockAssessment as any);

      await expect(
        service.create(
          {
            title: 'Kiểm tra TX1',
            classroomId: 'class-4a',
            semester: 1,
          },
          'teacher-1',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getGradebook', () => {
    it('generates complete Gradebook matrix with student scores and averages', async () => {
      jest.spyOn(prisma.classroom, 'findUnique').mockResolvedValue(mockClassroom as any);
      jest.spyOn(prisma.studentEnrollment, 'findMany').mockResolvedValue([
        { student: mockStudents[0] },
        { student: mockStudents[1] },
      ] as any);
      jest.spyOn(prisma.assessment, 'findMany').mockResolvedValue([mockAssessment] as any);

      const gradebook = await service.getGradebook(
        { classroomId: 'class-4a', subjectId: 'sub-math', semester: 1 },
        'teacher-1',
      );

      expect(gradebook).toBeDefined();
      expect(gradebook.classroomId).toBe('class-4a');
      expect(gradebook.columns).toHaveLength(1);
      expect(gradebook.students).toHaveLength(2);

      // Student 1 has score 8.5
      expect(gradebook.students[0].scores['assess-1'].score).toBe(8.5);
      expect(gradebook.students[0].averageScore).toBe(8.5);
      expect(gradebook.students[0].classification?.code).toBe('EXCELLENT');

      // Student 2 has no score (null)
      expect(gradebook.students[1].scores['assess-1'].score).toBeNull();
      expect(gradebook.students[1].averageScore).toBeNull();
      expect(gradebook.students[1].classification).toBeNull();

      // Summary
      expect(gradebook.summary.totalStudents).toBe(2);
      expect(gradebook.summary.gradedStudents).toBe(1);
      expect(gradebook.summary.classAverage).toBe(8.5);
    });

    it('rejects teacher who does not have access to classroom (IDOR prevention)', async () => {
      jest.spyOn(prisma.classroom, 'findUnique').mockResolvedValue(mockClassroom as any);
      jest.spyOn(prisma.classroom, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.teachingAssignment, 'findMany').mockResolvedValue([]);

      await expect(
        service.getGradebook({ classroomId: 'class-4a' }, 'teacher-other'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('bulkUpdateStudents (batch scores)', () => {
    it('saves batch scores and validates score range 0 to 10', async () => {
      jest.spyOn(prisma.assessment, 'findUnique').mockResolvedValue(mockAssessment as any);
      jest.spyOn(authService, 'assertStudentsEnrolled').mockResolvedValue(undefined as any);

      const res = await service.bulkUpdateStudents(
        'assess-1',
        {
          scores: [
            { studentId: 'student-1', score: 9.0, comment: 'Xuất sắc' },
            { studentId: 'student-2', score: 0, comment: 'Chưa làm bài' }, // valid score 0
          ],
        },
        'teacher-1',
      );

      expect(res.success).toBe(true);
    });

    it('rejects invalid score > 10', async () => {
      jest.spyOn(prisma.assessment, 'findUnique').mockResolvedValue(mockAssessment as any);

      await expect(
        service.bulkUpdateStudents(
          'assess-1',
          {
            scores: [{ studentId: 'student-1', score: 11.0 }],
          },
          'teacher-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate studentId in payload', async () => {
      jest.spyOn(prisma.assessment, 'findUnique').mockResolvedValue(mockAssessment as any);

      await expect(
        service.bulkUpdateStudents(
          'assess-1',
          {
            scores: [
              { studentId: 'student-1', score: 8.0 },
              { studentId: 'student-1', score: 9.0 },
            ],
          },
          'teacher-1',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });
});
