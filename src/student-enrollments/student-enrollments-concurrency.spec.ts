import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { StudentEnrollmentsService } from './student-enrollments.service';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollmentStatus } from '@prisma/client';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';

describe('StudentEnrollmentsService (Concurrency & Invariants)', () => {
  let service: StudentEnrollmentsService;
  let prisma: PrismaService;

  const mockActiveEnrollment = {
    id: 'enroll-1',
    studentId: 'student-1',
    schoolYearId: 'sy-2026',
    classroomId: 'class-4a',
    status: EnrollmentStatus.ACTIVE,
    enrolledAt: new Date('2026-09-01'),
    leftAt: null,
  };

  const mockClassroom4B = {
    id: 'class-4b',
    code: '4B',
    name: 'Lớp 4B',
    schoolYearId: 'sy-2026',
    isActive: true,
    deletedAt: null,
  };

  const mockClassroom4C = {
    id: 'class-4c',
    code: '4C',
    name: 'Lớp 4C',
    schoolYearId: 'sy-2026',
    isActive: true,
    deletedAt: null,
  };

  const mockPrisma: any = {
    student: { findUnique: jest.fn() },
    schoolYear: { findUnique: jest.fn() },
    classroom: { findUnique: jest.fn() },
    studentEnrollment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    classStudent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    $queryRaw: jest.fn(),
  };

  const mockClassroomAccess = {
    assertAuthenticatedHomeroomTeacher: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.studentEnrollment.findUnique.mockResolvedValue({ classroomId: 'class-4a' });
    mockClassroomAccess.assertAuthenticatedHomeroomTeacher.mockResolvedValue({ id: 'class-4a' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentEnrollmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TeachingAssignmentAuthorizationService, useValue: mockClassroomAccess },
      ],
    }).compile();

    service = module.get<StudentEnrollmentsService>(StudentEnrollmentsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('Concurrent transfer: second concurrent request fails when status is already TRANSFERRED', async () => {
    // Request 1 locks row and sees ACTIVE
    mockPrisma.$queryRaw.mockResolvedValueOnce([mockActiveEnrollment]);
    mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroom4B);
    mockPrisma.studentEnrollment.update.mockResolvedValueOnce({
      ...mockActiveEnrollment,
      status: EnrollmentStatus.TRANSFERRED,
    });
    mockPrisma.studentEnrollment.create.mockResolvedValueOnce({
      id: 'enroll-2',
      studentId: 'student-1',
      schoolYearId: 'sy-2026',
      classroomId: 'class-4b',
      status: EnrollmentStatus.ACTIVE,
      enrolledAt: new Date('2026-11-16'),
      leftAt: null,
    });

    const res1 = await service.transfer('enroll-1', {
      targetClassroomId: 'class-4b',
      transferDate: '2026-11-16T00:00:00.000Z',
    }, 'teacher-1');
    expect(res1.status).toBe(EnrollmentStatus.ACTIVE);
    expect(res1.classroomId).toBe('class-4b');

    // Request 2 locks row and sees TRANSFERRED -> must throw BadRequestException
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { ...mockActiveEnrollment, status: EnrollmentStatus.TRANSFERRED },
    ]);
    mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroom4C);

    await expect(
      service.transfer('enroll-1', {
        targetClassroomId: 'class-4c',
        transferDate: '2026-11-16T00:00:00.000Z',
      }, 'teacher-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('PostgreSQL partial unique violation (P2002) is cleanly mapped to ConflictException 409', async () => {
    mockPrisma.student.findUnique.mockResolvedValueOnce({ id: 'student-1', deletedAt: null });
    mockPrisma.schoolYear.findUnique.mockResolvedValueOnce({ id: 'sy-2026', isActive: true });
    mockPrisma.classroom.findUnique.mockResolvedValueOnce({ id: 'class-4a', schoolYearId: 'sy-2026', isActive: true, deletedAt: null });
    mockPrisma.studentEnrollment.findFirst.mockResolvedValueOnce(null);

    const prismaError: any = new Error('Unique constraint failed on the fields: (studentId, schoolYearId)');
    prismaError.code = 'P2002';
    mockPrisma.studentEnrollment.create.mockRejectedValueOnce(prismaError);

    await expect(
      service.create({
        studentId: 'student-1',
        schoolYearId: 'sy-2026',
        classroomId: 'class-4a',
      }, 'teacher-1'),
    ).rejects.toThrow(ConflictException);
  });
});
