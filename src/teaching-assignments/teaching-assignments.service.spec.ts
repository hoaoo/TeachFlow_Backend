import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { TeachingAssignmentsService } from './teaching-assignments.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

describe('TeachingAssignmentsService', () => {
  let service: TeachingAssignmentsService;
  let prisma: PrismaService;

  const mockTeacher = {
    id: 'teacher-1',
    userId: 'user-1',
    fullName: 'Cô Nguyễn Thị Mai',
    phone: '0901234567',
    user: { id: 'user-1', role: Role.TEACHER, isActive: true },
  };

  const mockAdminTeacher = {
    id: 'teacher-admin',
    userId: 'user-admin',
    fullName: 'Admin User',
    phone: '0909999999',
    user: { id: 'user-admin', role: Role.ADMIN, isActive: true },
  };

  const mockSchoolYear = {
    id: 'sy-2026',
    name: 'Năm học 2026 - 2027',
    isActive: true,
    isCurrent: true,
    startDate: new Date('2026-09-01'),
    endDate: new Date('2027-05-31'),
  };

  const mockClassroom4A = {
    id: 'class-4a',
    code: '4A',
    name: 'Lớp 4A',
    schoolYearId: 'sy-2026',
    gradeId: 'grade-4',
    teacherId: 'teacher-1', // Homeroom teacher
    isActive: true,
    deletedAt: null,
    grade: { name: 'Khối 4' },
  };

  const mockClassroom4B = {
    id: 'class-4b',
    code: '4B',
    name: 'Lớp 4B',
    schoolYearId: 'sy-2026',
    gradeId: 'grade-4',
    teacherId: 'teacher-2',
    isActive: true,
    deletedAt: null,
    grade: { name: 'Khối 4' },
  };

  const mockSubjectMath = {
    id: 'sub-math',
    code: 'MATH',
    name: 'Toán',
    isActive: true,
  };

  const mockSubjectVietnamese = {
    id: 'sub-vietnamese',
    code: 'VIETNAMESE',
    name: 'Tiếng Việt',
    isActive: true,
  };

  const mockAssignment1 = {
    id: 'asg-1',
    teacherId: 'teacher-1',
    classroomId: 'class-4a',
    subjectId: 'sub-math',
    schoolYearId: 'sy-2026',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    teacher: mockTeacher,
    classroom: mockClassroom4A,
    subject: mockSubjectMath,
    schoolYear: mockSchoolYear,
  };

  const mockPrisma: any = {
    teacher: { findUnique: jest.fn() },
    classroom: { findUnique: jest.fn(), findMany: jest.fn() },
    subject: { findUnique: jest.fn(), findMany: jest.fn() },
    schoolYear: { findUnique: jest.fn(), findMany: jest.fn() },
    teachingAssignment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    lessonPlan: { count: jest.fn() },
    attendanceSession: { count: jest.fn() },
    assessment: { count: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeachingAssignmentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TeachingAssignmentsService>(TeachingAssignmentsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('1. Create valid assignment (Teacher + Classroom + Subject + SchoolYear) -> Success', async () => {
      mockPrisma.teacher.findUnique.mockResolvedValueOnce(mockTeacher);
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroom4A);
      mockPrisma.subject.findUnique.mockResolvedValueOnce(mockSubjectMath);
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(mockSchoolYear);
      mockPrisma.teachingAssignment.findFirst.mockResolvedValueOnce(null);
      mockPrisma.teachingAssignment.create.mockResolvedValueOnce(mockAssignment1);

      const result = await service.create({
        teacherId: 'teacher-1',
        classroomId: 'class-4a',
        subjectId: 'sub-math',
        schoolYearId: 'sy-2026',
      });

      expect(result.id).toBe('asg-1');
      expect(result.teacher?.fullName).toBe('Cô Nguyễn Thị Mai');
      expect(result.classroom?.code).toBe('4A');
      expect(result.subject?.code).toBe('MATH');
      expect(result.isActive).toBe(true);
    });

    it('2. Reject when Classroom and SchoolYear do not match (SchoolYear invariant)', async () => {
      mockPrisma.teacher.findUnique.mockResolvedValueOnce(mockTeacher);
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroom4A); // schoolYearId is sy-2026
      mockPrisma.subject.findUnique.mockResolvedValueOnce(mockSubjectMath);

      await expect(
        service.create({
          teacherId: 'teacher-1',
          classroomId: 'class-4a',
          subjectId: 'sub-math',
          schoolYearId: 'sy-2027-different',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('3. Reject when User role is not TEACHER', async () => {
      mockPrisma.teacher.findUnique.mockResolvedValueOnce(mockAdminTeacher);

      await expect(
        service.create({
          teacherId: 'teacher-admin',
          classroomId: 'class-4a',
          subjectId: 'sub-math',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('4. Reject when Classroom is inactive', async () => {
      mockPrisma.teacher.findUnique.mockResolvedValueOnce(mockTeacher);
      mockPrisma.classroom.findUnique.mockResolvedValueOnce({
        ...mockClassroom4A,
        isActive: false,
      });

      await expect(
        service.create({
          teacherId: 'teacher-1',
          classroomId: 'class-4a',
          subjectId: 'sub-math',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('5. Reject when Subject is inactive', async () => {
      mockPrisma.teacher.findUnique.mockResolvedValueOnce(mockTeacher);
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroom4A);
      mockPrisma.subject.findUnique.mockResolvedValueOnce({
        ...mockSubjectMath,
        isActive: false,
      });

      await expect(
        service.create({
          teacherId: 'teacher-1',
          classroomId: 'class-4a',
          subjectId: 'sub-math',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('6. Reject duplicate active exact assignment (Pre-check ConflictException 409)', async () => {
      mockPrisma.teacher.findUnique.mockResolvedValueOnce(mockTeacher);
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroom4A);
      mockPrisma.subject.findUnique.mockResolvedValueOnce(mockSubjectMath);
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(mockSchoolYear);
      mockPrisma.teachingAssignment.findFirst.mockResolvedValueOnce(mockAssignment1);

      await expect(
        service.create({
          teacherId: 'teacher-1',
          classroomId: 'class-4a',
          subjectId: 'sub-math',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('7. Catch PostgreSQL partial unique violation (P2002) and throw ConflictException', async () => {
      mockPrisma.teacher.findUnique.mockResolvedValueOnce(mockTeacher);
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroom4A);
      mockPrisma.subject.findUnique.mockResolvedValueOnce(mockSubjectMath);
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(mockSchoolYear);
      mockPrisma.teachingAssignment.findFirst.mockResolvedValueOnce(null);

      const p2002Err: any = new Error('Unique constraint failed');
      p2002Err.code = 'P2002';
      mockPrisma.teachingAssignment.create.mockRejectedValueOnce(p2002Err);

      await expect(
        service.create({
          teacherId: 'teacher-1',
          classroomId: 'class-4a',
          subjectId: 'sub-math',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Business separation & Teacher Isolation', () => {
    it('8. Teacher isolation: findMyAssignments only returns assignments for requested teacher', async () => {
      mockPrisma.teachingAssignment.findMany.mockResolvedValueOnce([mockAssignment1]);

      const res = await service.findMyAssignments('teacher-1', 'sy-2026');
      expect(res).toHaveLength(1);
      expect(res[0].teacherId).toBe('teacher-1');
      expect(mockPrisma.teachingAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { teacherId: 'teacher-1', isActive: true, schoolYearId: 'sy-2026' },
        }),
      );
    });

    it('9. Homeroom separation: Classroom.teacherId does not create implicit subject assignments', async () => {
      // Teacher 1 is homeroom for 4A, but only has MATH assignment
      mockPrisma.teachingAssignment.findMany.mockResolvedValueOnce([mockAssignment1]);

      const res = await service.findMyAssignments('teacher-1');
      const subjectCodes = res.map((a) => a.subject?.code);
      expect(subjectCodes).toContain('MATH');
      expect(subjectCodes).not.toContain('VIETNAMESE'); // No automatic Vietnamese
    });

    it('10. Same teacher can be assigned multiple different subjects in same classroom', async () => {
      mockPrisma.teacher.findUnique.mockResolvedValueOnce(mockTeacher);
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroom4A);
      mockPrisma.subject.findUnique.mockResolvedValueOnce(mockSubjectVietnamese);
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(mockSchoolYear);
      mockPrisma.teachingAssignment.findFirst.mockResolvedValueOnce(null);
      mockPrisma.teachingAssignment.create.mockResolvedValueOnce({
        ...mockAssignment1,
        id: 'asg-2',
        subjectId: 'sub-vietnamese',
        subject: mockSubjectVietnamese,
      });

      const res = await service.create({
        teacherId: 'teacher-1',
        classroomId: 'class-4a',
        subjectId: 'sub-vietnamese',
      });
      expect(res.id).toBe('asg-2');
      expect(res.subject?.code).toBe('VIETNAMESE');
    });

    it('11. Same teacher can be assigned same subject across different classrooms', async () => {
      mockPrisma.teacher.findUnique.mockResolvedValueOnce(mockTeacher);
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroom4B);
      mockPrisma.subject.findUnique.mockResolvedValueOnce(mockSubjectMath);
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(mockSchoolYear);
      mockPrisma.teachingAssignment.findFirst.mockResolvedValueOnce(null);
      mockPrisma.teachingAssignment.create.mockResolvedValueOnce({
        ...mockAssignment1,
        id: 'asg-3',
        classroomId: 'class-4b',
        classroom: mockClassroom4B,
      });

      const res = await service.create({
        teacherId: 'teacher-1',
        classroomId: 'class-4b',
        subjectId: 'sub-math',
      });
      expect(res.id).toBe('asg-3');
      expect(res.classroom?.code).toBe('4B');
    });

    it('12. Deactivate assignment sets isActive = false without hard deleting', async () => {
      mockPrisma.teachingAssignment.findUnique.mockResolvedValueOnce(mockAssignment1);
      mockPrisma.teachingAssignment.update.mockResolvedValueOnce({
        ...mockAssignment1,
        isActive: false,
      });

      const res = await service.deactivate('asg-1');
      expect(res.isActive).toBe(false);
      expect(mockPrisma.teachingAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'asg-1' },
          data: { isActive: false },
        }),
      );
    });

    it('13. existsActiveAssignment helper returns true when active assignment exists', async () => {
      mockPrisma.teachingAssignment.count.mockResolvedValueOnce(1);
      const exists = await service.existsActiveAssignment('teacher-1', 'class-4a', 'sub-math', 'sy-2026');
      expect(exists).toBe(true);

      mockPrisma.teachingAssignment.count.mockResolvedValueOnce(0);
      const notExists = await service.existsActiveAssignment('teacher-1', 'class-4a', 'sub-history', 'sy-2026');
      expect(notExists).toBe(false);
    });

    it('14. Rejects mutating identity fields (teacherId, classroomId, subjectId) when assignment is referenced by downstream resources', async () => {
      mockPrisma.teachingAssignment.findUnique.mockResolvedValueOnce(mockAssignment1);
      mockPrisma.lessonPlan.count.mockResolvedValueOnce(3);
      mockPrisma.attendanceSession.count.mockResolvedValueOnce(1);
      mockPrisma.assessment.count.mockResolvedValueOnce(2);

      await expect(
        service.update('asg-1', {
          subjectId: 'sub-vietnamese',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('15. Allows updating isActive even when assignment has downstream references', async () => {
      mockPrisma.teachingAssignment.findUnique.mockResolvedValueOnce(mockAssignment1);
      mockPrisma.teachingAssignment.update.mockResolvedValueOnce({
        ...mockAssignment1,
        isActive: false,
      });

      const res = await service.update('asg-1', {
        isActive: false,
      });

      expect(res.isActive).toBe(false);
    });
  });
});
