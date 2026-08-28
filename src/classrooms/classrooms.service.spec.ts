import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ClassroomsService } from './classrooms.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';
import { AuditService } from '../common/audit/audit.service';

describe('ClassroomsService (Phase 2 Master Data & Authorization)', () => {
  let service: ClassroomsService;
  let prisma: PrismaService;

  const mockTeacherA = { id: 'teacher-a', fullName: 'Cô Nguyễn Thị Mai', phone: '0901111111' };
  const mockSchoolYearCurrent = { id: 'sy-2026', name: '2026 - 2027', isActive: true, isCurrent: true };
  const mockSchoolYearOther = { id: 'sy-2027', name: '2027 - 2028', isActive: true, isCurrent: false };
  const mockSchoolYearInactive = { id: 'sy-inactive', name: '2024 - 2025', isActive: false, isCurrent: false };
  const mockGrade4 = { id: 'grade-4', code: 'K04', name: 'Khối 4', level: 4, isActive: true };
  const mockGradeInactive = { id: 'grade-inactive', code: 'K99', name: 'Khối 99', level: 99, isActive: false };

  const mockClassroomA = {
    id: 'class-a',
    code: '4A',
    name: 'Lớp 4A',
    schoolYearId: 'sy-2026',
    gradeId: 'grade-4',
    teacherId: 'teacher-a',
    deletedAt: null,
    status: 'ACTIVE',
    isActive: true,
    grade: mockGrade4,
    schoolYear: mockSchoolYearCurrent,
    teacher: mockTeacherA,
    classStudents: [],
  };

  const mockPrisma = {
    classroom: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    schoolYear: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    grade: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    teacher: {
      findUnique: jest.fn(),
    },
    classStudent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    student: {
      create: jest.fn(),
    },
    studentComment: {
      create: jest.fn(),
    },
    teachingAssignment: {
      create: jest.fn(),
    },
  };

  const mockAssignmentAuth = {
    assertTeacherCanAccessClassroom: jest.fn().mockImplementation(
      async (_classroomId: string, _teacherId?: string) => mockClassroomA,
    ),
    assertTeacherCanAccessClassroomAttendance: jest.fn(),
    assertAuthenticatedHomeroomTeacher: jest.fn().mockResolvedValue(mockClassroomA),
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassroomsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TeachingAssignmentAuthorizationService, useValue: mockAssignmentAuth },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<ClassroomsService>(ClassroomsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('homeroom assignment', () => {
    it('rejects assigning a classroom from a non-current school year', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValueOnce({
        ...mockClassroomA,
        schoolYearId: mockSchoolYearOther.id,
        schoolYear: mockSchoolYearOther,
      });

      await expect(service.setAsHomeroom('class-a', 'teacher-a')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.classroom.update).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create classroom successfully when all validations pass', async () => {
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(mockSchoolYearCurrent);
      mockPrisma.grade.findUnique.mockResolvedValueOnce(mockGrade4);
      mockPrisma.teacher.findUnique.mockResolvedValueOnce(mockTeacherA);
      mockPrisma.classroom.findFirst.mockResolvedValueOnce(null);
      mockPrisma.classroom.create.mockResolvedValueOnce(mockClassroomA);

      const result = await service.create(
        {
          schoolYearId: 'sy-2026',
          gradeId: 'grade-4',
          code: '4A',
          name: 'Lớp 4A',
          homeroomTeacherId: 'teacher-a',
        },
        'teacher-a',
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('class-a');
      expect(result.code).toBe('4A');
      expect(mockPrisma.classroom.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: '4A',
          name: 'Lớp 4A',
          schoolYearId: 'sy-2026',
          gradeId: 'grade-4',
          teacherId: 'teacher-a',
        }),
        include: expect.any(Object),
      });
    });

    it('should NOT auto-create teachingAssignment or auto-assign subject when creating classroom', async () => {
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(mockSchoolYearCurrent);
      mockPrisma.grade.findUnique.mockResolvedValueOnce(mockGrade4);
      mockPrisma.teacher.findUnique.mockResolvedValueOnce(mockTeacherA);
      mockPrisma.classroom.findFirst.mockResolvedValueOnce(null);
      mockPrisma.classroom.create.mockResolvedValueOnce(mockClassroomA);
      mockPrisma.teachingAssignment.create.mockClear();

      await service.create(
        {
          schoolYearId: 'sy-2026',
          gradeId: 'grade-4',
          code: '4A',
          name: 'Lớp 4A',
        },
        'teacher-a',
      );

      expect(mockPrisma.teachingAssignment.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if classroom code already exists in the same school year', async () => {
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(mockSchoolYearCurrent);
      mockPrisma.grade.findUnique.mockResolvedValueOnce(mockGrade4);
      mockPrisma.teacher.findUnique.mockResolvedValueOnce(mockTeacherA);
      mockPrisma.classroom.findFirst.mockResolvedValueOnce(mockClassroomA);

      await expect(
        service.create(
          {
            schoolYearId: 'sy-2026',
            gradeId: 'grade-4',
            code: '4A',
            name: 'Lớp 4A',
            homeroomTeacherId: 'teacher-a',
          },
          'teacher-a',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('allows the same class code for two different teachers in one school year', async () => {
      mockPrisma.schoolYear.findUnique.mockResolvedValue(mockSchoolYearCurrent);
      mockPrisma.grade.findUnique.mockResolvedValue(mockGrade4);
      mockPrisma.teacher.findUnique.mockResolvedValue(mockTeacherA);
      mockPrisma.classroom.findFirst.mockResolvedValue(null);
      mockPrisma.classroom.create
        .mockResolvedValueOnce({ ...mockClassroomA, teacherId: 'teacher-a' })
        .mockResolvedValueOnce({ ...mockClassroomA, id: 'class-b', teacherId: 'teacher-b' });

      const dto = {
        schoolYearId: 'sy-2026',
        gradeId: 'grade-4',
        code: '1A',
        name: '1A',
      };

      await service.create(dto, 'teacher-a');
      await service.create(dto, 'teacher-b');

      expect(mockPrisma.classroom.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ data: expect.objectContaining({ teacherId: 'teacher-a', code: '1A' }) }),
      );
      expect(mockPrisma.classroom.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ data: expect.objectContaining({ teacherId: 'teacher-b', code: '1A' }) }),
      );
    });
    it('should allow same code in a different school year', async () => {
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(mockSchoolYearOther);
      mockPrisma.grade.findUnique.mockResolvedValueOnce(mockGrade4);
      mockPrisma.teacher.findUnique.mockResolvedValueOnce(mockTeacherA);
      mockPrisma.classroom.findFirst.mockResolvedValueOnce(null);
      mockPrisma.classroom.create.mockResolvedValueOnce({
        ...mockClassroomA,
        id: 'class-a-2027',
        schoolYearId: 'sy-2027',
        schoolYear: mockSchoolYearOther,
      });

      const result = await service.create(
        {
          schoolYearId: 'sy-2027',
          gradeId: 'grade-4',
          code: '4A',
          name: 'Lớp 4A',
          homeroomTeacherId: 'teacher-a',
        },
        'teacher-a',
      );

      expect(result.id).toBe('class-a-2027');
      expect(result.code).toBe('4A');
    });

    it('should throw NotFoundException if school year does not exist', async () => {
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.create(
          {
            schoolYearId: 'invalid-sy',
            gradeId: 'grade-4',
            code: '4A',
            name: 'Lớp 4A',
          },
          'teacher-a',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if school year is inactive', async () => {
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(mockSchoolYearInactive);

      await expect(
        service.create(
          {
            schoolYearId: 'sy-inactive',
            gradeId: 'grade-4',
            code: '4A',
            name: 'Lớp 4A',
          },
          'teacher-a',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if grade does not exist', async () => {
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(mockSchoolYearCurrent);
      mockPrisma.grade.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.create(
          {
            schoolYearId: 'sy-2026',
            gradeId: 'invalid-grade',
            code: '4A',
            name: 'Lớp 4A',
          },
          'teacher-a',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if grade is inactive', async () => {
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(mockSchoolYearCurrent);
      mockPrisma.grade.findUnique.mockResolvedValueOnce(mockGradeInactive);

      await expect(
        service.create(
          {
            schoolYearId: 'sy-2026',
            gradeId: 'grade-inactive',
            code: '4A',
            name: 'Lớp 4A',
          },
          'teacher-a',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if specified teacher does not exist', async () => {
      mockPrisma.schoolYear.findUnique.mockResolvedValueOnce(mockSchoolYearCurrent);
      mockPrisma.grade.findUnique.mockResolvedValueOnce(mockGrade4);
      mockPrisma.teacher.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.create(
          {
            schoolYearId: 'sy-2026',
            gradeId: 'grade-4',
            code: '4A',
            name: 'Lớp 4A',
            homeroomTeacherId: 'invalid-teacher',
          },
          'teacher-a',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne & Authorization', () => {
    it('Teacher A can access their own classroom', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroomA);

      const result = await service.findOne('class-a', 'teacher-a');
      expect(result).toBeDefined();
      expect(result.id).toBe('class-a');
    });

    it('Teacher B is FORBIDDEN from accessing Teacher A classroom', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroomA);

      await expect(
        service.findOne('class-a', 'teacher-b'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Throws NotFoundException if class is soft-deleted', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValueOnce({
        ...mockClassroomA,
        deletedAt: new Date(),
      });

      await expect(
        service.findOne('class-a', 'teacher-a'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('student roster authorization', () => {
    it('returns 403 before mutation when a subject teacher adds a student', async () => {
      mockAssignmentAuth.assertAuthenticatedHomeroomTeacher.mockRejectedValueOnce(
        new ForbiddenException('Homeroom teacher required'),
      );

      await expect(
        service.addStudent(
          'class-a',
          { fullName: 'Subject teacher attempt' },
          'teacher-subject',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.student.create).not.toHaveBeenCalled();
    });
  });

  describe('remove (Soft delete)', () => {
    it('should soft delete classroom by setting deletedAt and isActive=false', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClassroomA);
      mockPrisma.classroom.update.mockResolvedValueOnce({
        ...mockClassroomA,
        deletedAt: new Date(),
        status: 'INACTIVE',
        isActive: false,
      });

      const res = await service.remove('class-a', 'teacher-a');
      expect(res.success).toBe(true);
      expect(mockPrisma.classroom.update).toHaveBeenCalledWith({
        where: { id: 'class-a' },
        data: { deletedAt: expect.any(Date), status: 'INACTIVE', isActive: false },
      });
    });
  });

  describe('Zero-Data KPIs and Classroom-Scoped Aggregation (Regression Tests)', () => {
    it('empty classroom returns null attendance rate and null average score', async () => {
      const mockEmptyClass = {
        id: 'class-empty',
        code: '1G',
        name: 'Lớp 1G',
        schoolYearId: 'sy-2026',
        gradeId: 'grade-1',
        teacherId: 'teacher-a',
        deletedAt: null,
        status: 'ACTIVE',
        isActive: true,
        grade: { id: 'grade-1', name: 'Khối 1' },
        schoolYear: mockSchoolYearCurrent,
        teacher: mockTeacherA,
        studentEnrollments: [],
        classStudents: [],
        attendanceSessions: [],
        assessments: [],
        schedules: [],
      };

      mockPrisma.classroom.findMany.mockResolvedValueOnce([mockEmptyClass]);

      const res = await service.findAll({ teacherId: 'teacher-a' });
      expect(res.items).toHaveLength(1);
      expect(res.items[0].studentCount).toBe(0);
      expect(res.items[0].attendance).toBeNull();
      expect(res.items[0].average).toBeNull();
      expect(res.summary.avgAttendanceRate).toBeNull();
      expect(res.summary.totalStudents).toBe(0);
    });

    it('classroom A metrics never leak into classroom B', async () => {
      const mockClassWithData = {
        id: 'class-a',
        code: '4A',
        name: 'Lớp 4A',
        schoolYearId: 'sy-2026',
        gradeId: 'grade-4',
        teacherId: 'teacher-a',
        deletedAt: null,
        status: 'ACTIVE',
        isActive: true,
        grade: mockGrade4,
        schoolYear: mockSchoolYearCurrent,
        teacher: mockTeacherA,
        studentEnrollments: [
          {
            status: 'ACTIVE',
            student: {
              id: 's1',
              fullName: 'Học sinh 1',
              gender: 'MALE',
              status: 'GOOD',
              deletedAt: null,
              studentAttendances: [{ status: 'PRESENT' }],
            },
          },
        ],
        attendanceSessions: [
          {
            attendances: [{ status: 'PRESENT' }],
          },
        ],
        assessments: [
          {
            studentAssessments: [{ score: 9 }],
          },
        ],
        schedules: [],
      };

      const mockClassEmpty = {
        id: 'class-b',
        code: '1G',
        name: 'Lớp 1G',
        schoolYearId: 'sy-2026',
        gradeId: 'grade-1',
        teacherId: 'teacher-a',
        deletedAt: null,
        status: 'ACTIVE',
        isActive: true,
        grade: { id: 'grade-1', name: 'Khối 1' },
        schoolYear: mockSchoolYearCurrent,
        teacher: mockTeacherA,
        studentEnrollments: [],
        attendanceSessions: [],
        assessments: [],
        schedules: [],
      };

      mockPrisma.classroom.findMany.mockResolvedValueOnce([mockClassWithData, mockClassEmpty]);

      const res = await service.findAll({ teacherId: 'teacher-a' });
      expect(res.items).toHaveLength(2);

      // Class A has its own calculated metrics
      const classA = res.items.find((c) => c.id === 'class-a');
      expect(classA?.attendance).toBe(100);
      expect(classA?.average).toBe(9);
      expect(classA?.studentCount).toBe(1);

      // Class B has null metrics and does NOT inherit Class A
      const classB = res.items.find((c) => c.id === 'class-b');
      expect(classB?.attendance).toBeNull();
      expect(classB?.average).toBeNull();
      expect(classB?.studentCount).toBe(0);
    });
  });
});
