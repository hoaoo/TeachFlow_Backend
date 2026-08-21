import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ClassroomsService } from './classrooms.service';
import { PrismaService } from '../prisma/prisma.service';

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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassroomsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClassroomsService>(ClassroomsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
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
});
