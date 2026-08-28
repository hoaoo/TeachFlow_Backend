import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { StudentEnrollmentsService } from './student-enrollments.service';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollmentStatus } from '@prisma/client';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';

describe('StudentEnrollmentsService (Phase 3)', () => {
  let service: StudentEnrollmentsService;
  let prisma: PrismaService;

  const mockStudent = {
    id: 'student-1',
    fullName: 'Nguyễn Văn An',
    studentCode: 'HS001',
    deletedAt: null,
  };

  const mockSchoolYear = {
    id: 'sy-2026',
    name: '2026 - 2027',
    startDate: new Date('2026-09-01'),
    endDate: new Date('2027-05-31'),
    isActive: true,
  };

  const mockSchoolYearInactive = {
    id: 'sy-2024',
    name: '2024 - 2025',
    isActive: false,
  };

  const mockClassroom4A = {
    id: 'class-4a',
    code: '4A',
    name: 'Lớp 4A',
    schoolYearId: 'sy-2026',
    teacherId: 'teacher-1',
    isActive: true,
    deletedAt: null,
    grade: { name: 'Khối 4' },
  };

  const mockClassroom4B = {
    id: 'class-4b',
    code: '4B',
    name: 'Lớp 4B',
    schoolYearId: 'sy-2026',
    teacherId: 'teacher-2',
    isActive: true,
    deletedAt: null,
    grade: { name: 'Khối 4' },
  };

  const mockClassroomOtherYear = {
    id: 'class-5a-2027',
    code: '5A',
    name: 'Lớp 5A',
    schoolYearId: 'sy-2027',
    teacherId: 'teacher-1',
    isActive: true,
    deletedAt: null,
  };

  const mockActiveEnrollment = {
    id: 'enrollment-1',
    studentId: 'student-1',
    schoolYearId: 'sy-2026',
    classroomId: 'class-4a',
    status: EnrollmentStatus.ACTIVE,
    enrolledAt: new Date('2026-09-05'),
    leftAt: null,
    student: mockStudent,
    classroom: mockClassroom4A,
    schoolYear: mockSchoolYear,
  };

  const mockPrisma: any = {
    student: {
      findUnique: jest.fn(),
    },
    schoolYear: {
      findUnique: jest.fn(),
    },
    classroom: {
      findUnique: jest.fn(),
    },
    studentEnrollment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    classStudent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (cb) => {
      if (typeof cb === 'function') {
        return cb(mockPrisma);
      }
      return cb;
    }),
    $queryRaw: jest.fn(),
  };

  const mockClassroomAccess = {
    assertAuthenticatedHomeroomTeacher: jest.fn().mockResolvedValue(mockClassroom4A),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      if (typeof cb === 'function') {
        return cb(mockPrisma);
      }
      return cb;
    });
    mockPrisma.studentEnrollment.findUnique.mockResolvedValue({
      classroomId: mockClassroom4A.id,
    });
    mockClassroomAccess.assertAuthenticatedHomeroomTeacher.mockResolvedValue(mockClassroom4A);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentEnrollmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: TeachingAssignmentAuthorizationService,
          useValue: mockClassroomAccess,
        },
      ],
    }).compile();

    service = module.get<StudentEnrollmentsService>(StudentEnrollmentsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('create', () => {
    it('should create an active enrollment when all conditions are met', async () => {
      mockPrisma.student.findUnique.mockResolvedValueOnce(mockStudent);
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(mockSchoolYear);
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroom4A);
      mockPrisma.studentEnrollment.findFirst.mockResolvedValueOnce(null);
      mockPrisma.studentEnrollment.create.mockResolvedValueOnce(mockActiveEnrollment);
      mockPrisma.classStudent.findUnique.mockResolvedValueOnce(null);
      mockPrisma.classStudent.create.mockResolvedValueOnce({});

      const result = await service.create({
        studentId: 'student-1',
        schoolYearId: 'sy-2026',
        classroomId: 'class-4a',
      }, 'teacher-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('enrollment-1');
      expect(result.status).toBe(EnrollmentStatus.ACTIVE);
      expect(mockPrisma.studentEnrollment.create).toHaveBeenCalled();
    });

    it('should reject if classroom.schoolYearId !== dto.schoolYearId', async () => {
      mockPrisma.student.findUnique.mockResolvedValueOnce(mockStudent);
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(mockSchoolYear);
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroomOtherYear);

      await expect(
        service.create({
          studentId: 'student-1',
          schoolYearId: 'sy-2026',
          classroomId: 'class-5a-2027',
        }, 'teacher-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if student already has active enrollment in the same school year', async () => {
      mockPrisma.student.findUnique.mockResolvedValueOnce(mockStudent);
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(mockSchoolYear);
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroom4A);
      mockPrisma.studentEnrollment.findFirst.mockResolvedValueOnce(mockActiveEnrollment);

      await expect(
        service.create({
          studentId: 'student-1',
          schoolYearId: 'sy-2026',
          classroomId: 'class-4a',
        }, 'teacher-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if schoolYear is inactive', async () => {
      mockPrisma.student.findUnique.mockResolvedValueOnce(mockStudent);
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(mockSchoolYearInactive);

      await expect(
        service.create({
          studentId: 'student-1',
          schoolYearId: 'sy-2024',
          classroomId: 'class-4a',
        }, 'teacher-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('transfer', () => {
    it('returns 403 before mutating a cross-teacher enrollmentId', async () => {
      mockPrisma.studentEnrollment.findUnique.mockResolvedValueOnce({
        classroomId: 'class-owned-by-other-teacher',
      });
      mockClassroomAccess.assertAuthenticatedHomeroomTeacher.mockRejectedValueOnce(
        new ForbiddenException('Homeroom teacher required'),
      );

      await expect(
        service.transfer(
          'cross-teacher-enrollment',
          { targetClassroomId: 'class-4b' },
          'teacher-1',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
      expect(mockPrisma.studentEnrollment.update).not.toHaveBeenCalled();
    });

    it('should successfully transfer student to new class in the same school year without overwriting history', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([mockActiveEnrollment]);
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroom4B);
      mockPrisma.studentEnrollment.update.mockResolvedValueOnce({
        ...mockActiveEnrollment,
        status: EnrollmentStatus.TRANSFERRED,
        leftAt: new Date('2026-11-16'),
      });
      mockPrisma.studentEnrollment.create.mockResolvedValueOnce({
        id: 'enrollment-2',
        studentId: 'student-1',
        schoolYearId: 'sy-2026',
        classroomId: 'class-4b',
        status: EnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-11-16'),
        leftAt: null,
        student: mockStudent,
        classroom: mockClassroom4B,
        schoolYear: mockSchoolYear,
      });
      mockPrisma.classStudent.findUnique.mockResolvedValue(null);
      mockPrisma.classStudent.create.mockResolvedValue({});

      const result = await service.transfer('enrollment-1', {
        targetClassroomId: 'class-4b',
        transferDate: '2026-11-16T00:00:00.000Z',
        reason: 'Chuyển lớp theo nguyện vọng phụ huynh',
      }, 'teacher-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('enrollment-2');
      expect(result.status).toBe(EnrollmentStatus.ACTIVE);
      expect(result.classroomId).toBe('class-4b');

      // Verify old enrollment updated to TRANSFERRED
      expect(mockPrisma.studentEnrollment.update).toHaveBeenCalledWith({
        where: { id: 'enrollment-1' },
        data: expect.objectContaining({
          status: EnrollmentStatus.TRANSFERRED,
        }),
      });

      // Verify new enrollment created as ACTIVE
      expect(mockPrisma.studentEnrollment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          studentId: 'student-1',
          classroomId: 'class-4b',
          schoolYearId: 'sy-2026',
          status: EnrollmentStatus.ACTIVE,
        }),
        include: expect.any(Object),
      });
    });

    it('should reject transfer to the same classroom', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([mockActiveEnrollment]);
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroom4A);

      await expect(
        service.transfer('enrollment-1', {
          targetClassroomId: 'class-4a',
        }, 'teacher-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject transfer to a classroom belonging to a different school year', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([mockActiveEnrollment]);
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroomOtherYear);

      await expect(
        service.transfer('enrollment-1', {
          targetClassroomId: 'class-5a-2027',
        }, 'teacher-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject transfer if source enrollment is not ACTIVE (e.g. already transferred)', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { ...mockActiveEnrollment, status: EnrollmentStatus.TRANSFERRED },
      ]);

      await expect(
        service.transfer('enrollment-1', {
          targetClassroomId: 'class-4b',
        }, 'teacher-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if transferDate is earlier than source enrolledAt', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([mockActiveEnrollment]);
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroom4B);

      await expect(
        service.transfer('enrollment-1', {
          targetClassroomId: 'class-4b',
          transferDate: '2026-08-01T00:00:00.000Z', // earlier than 2026-09-05
        }, 'teacher-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('withdraw', () => {
    it('should withdraw student and set status to WITHDRAWN with leftAt', async () => {
      mockPrisma.studentEnrollment.findUnique.mockResolvedValueOnce(mockActiveEnrollment);
      mockPrisma.studentEnrollment.update.mockResolvedValueOnce({
        ...mockActiveEnrollment,
        status: EnrollmentStatus.WITHDRAWN,
        leftAt: new Date('2026-12-01'),
      });
      mockPrisma.classStudent.findUnique.mockResolvedValueOnce({ id: 'cs-1' });
      mockPrisma.classStudent.update.mockResolvedValueOnce({});

      const result = await service.withdraw('enrollment-1', {
        withdrawDate: '2026-12-01T00:00:00.000Z',
        reason: 'Chuyển trường',
      }, 'teacher-1');

      expect(result.status).toBe(EnrollmentStatus.WITHDRAWN);
      expect(mockPrisma.studentEnrollment.update).toHaveBeenCalledWith({
        where: { id: 'enrollment-1' },
        data: expect.objectContaining({
          status: EnrollmentStatus.WITHDRAWN,
        }),
        include: expect.any(Object),
      });
    });
  });
});
