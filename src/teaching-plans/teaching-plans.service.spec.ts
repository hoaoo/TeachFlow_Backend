import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TeachingPlansService } from './teaching-plans.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TeachingPlansService (Schedule & Overlap Regression)', () => {
  let service: TeachingPlansService;
  let mockPrisma: any;

  const mockTeacherId = 'teacher-uuid-1';
  const mockOtherTeacherId = 'teacher-uuid-2';
  const mockClassroomId = 'class-uuid-1';
  const mockSubjectId = 'subject-math-1';
  const mockSchoolYearId = 'sy-2026';

  const mockClassroom = {
    id: mockClassroomId,
    name: 'Lớp 4A1',
    code: '4A1',
    teacherId: mockTeacherId,
    schoolYearId: mockSchoolYearId,
    deletedAt: null,
    grade: { name: 'Khối 4' },
  };

  const mockSubject = {
    id: mockSubjectId,
    name: 'Toán học',
    code: 'MATH',
    isActive: true,
  };

  const mockSchoolYear = {
    id: mockSchoolYearId,
    name: '2026 - 2027',
    isCurrent: true,
  };

  beforeEach(async () => {
    mockPrisma = {
      classroom: {
        findUnique: jest.fn().mockResolvedValue(mockClassroom),
      },
      subject: {
        findUnique: jest.fn().mockResolvedValue(mockSubject),
      },
      schoolYear: {
        findUnique: jest.fn().mockResolvedValue(mockSchoolYear),
      },
      teachingPlan: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeachingPlansService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TeachingPlansService>(TeachingPlansService);
  });

  describe('create - schedule overlap checks', () => {
    it('should reject schedule with startTime >= endTime with BadRequestException', async () => {
      await expect(
        service.create(
          {
            classroomId: mockClassroomId,
            subjectId: mockSubjectId,
            title: 'Tiết 1: Ôn tập phân số',
            plannedDate: '2026-08-25',
            startTime: '08:00',
            endTime: '07:45',
          },
          mockTeacherId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject partial overlap: 07:30–08:15 when 07:00–07:45 already exists with 409 ConflictException', async () => {
      mockPrisma.teachingPlan.findMany.mockResolvedValueOnce([
        {
          id: 'existing-plan-1',
          teacherId: mockTeacherId,
          classroomId: mockClassroomId,
          title: 'Tiết 1: Toán',
          plannedDate: new Date('2026-08-25T00:00:00'),
          startTime: '07:00',
          endTime: '07:45',
        },
      ]);

      await expect(
        service.create(
          {
            classroomId: mockClassroomId,
            subjectId: mockSubjectId,
            title: 'Tiết 2: Khoa học',
            plannedDate: '2026-08-25',
            startTime: '07:30',
            endTime: '08:15',
          },
          mockTeacherId,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject double submit / exact duplicate schedule with 409 ConflictException', async () => {
      mockPrisma.teachingPlan.findMany.mockResolvedValueOnce([
        {
          id: 'existing-plan-1',
          teacherId: mockTeacherId,
          classroomId: mockClassroomId,
          title: 'Tiết 1: Toán',
          plannedDate: new Date('2026-08-25T00:00:00'),
          startTime: '07:00',
          endTime: '07:45',
        },
      ]);

      await expect(
        service.create(
          {
            classroomId: mockClassroomId,
            subjectId: mockSubjectId,
            title: 'Tiết 1: Toán',
            plannedDate: '2026-08-25',
            startTime: '07:00',
            endTime: '07:45',
          },
          mockTeacherId,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should accept adjacent schedule: 07:45–08:30 after 07:00–07:45', async () => {
      mockPrisma.teachingPlan.findMany.mockResolvedValueOnce([
        {
          id: 'existing-plan-1',
          teacherId: mockTeacherId,
          classroomId: mockClassroomId,
          title: 'Tiết 1: Toán',
          plannedDate: new Date('2026-08-25T00:00:00'),
          startTime: '07:00',
          endTime: '07:45',
        },
      ]);

      mockPrisma.teachingPlan.create.mockResolvedValueOnce({
        id: 'new-plan-2',
        teacherId: mockTeacherId,
        classroomId: mockClassroomId,
        subjectId: mockSubjectId,
        schoolYearId: mockSchoolYearId,
        title: 'Tiết 2: Tiếng Việt',
        plannedDate: new Date('2026-08-25T00:00:00'),
        startTime: '07:45',
        endTime: '08:30',
        status: 'PLANNED',
        classroom: mockClassroom,
        subject: mockSubject,
        schoolYear: mockSchoolYear,
      });

      const result = await service.create(
        {
          classroomId: mockClassroomId,
          subjectId: mockSubjectId,
          title: 'Tiết 2: Tiếng Việt',
          plannedDate: '2026-08-25',
          startTime: '07:45',
          endTime: '08:30',
        },
        mockTeacherId,
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('new-plan-2');
      expect(result.startTime).toBe('07:45');
      expect(result.endTime).toBe('08:30');
    });

    it('should accept non-overlapping later schedule: 08:00–08:45 after 07:00–07:45', async () => {
      mockPrisma.teachingPlan.findMany.mockResolvedValueOnce([
        {
          id: 'existing-plan-1',
          teacherId: mockTeacherId,
          classroomId: mockClassroomId,
          title: 'Tiết 1: Toán',
          plannedDate: new Date('2026-08-25T00:00:00'),
          startTime: '07:00',
          endTime: '07:45',
        },
      ]);

      mockPrisma.teachingPlan.create.mockResolvedValueOnce({
        id: 'new-plan-3',
        teacherId: mockTeacherId,
        classroomId: mockClassroomId,
        subjectId: mockSubjectId,
        schoolYearId: mockSchoolYearId,
        title: 'Tiết 3: Luyện tập',
        plannedDate: new Date('2026-08-25T00:00:00'),
        startTime: '08:00',
        endTime: '08:45',
        status: 'PLANNED',
        classroom: mockClassroom,
        subject: mockSubject,
        schoolYear: mockSchoolYear,
      });

      const result = await service.create(
        {
          classroomId: mockClassroomId,
          subjectId: mockSubjectId,
          title: 'Tiết 3: Luyện tập',
          plannedDate: '2026-08-25',
          startTime: '08:00',
          endTime: '08:45',
        },
        mockTeacherId,
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('new-plan-3');
    });
  });

  describe('security isolation', () => {
    it('should reject creating schedule for classroom owned by another teacher', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValueOnce({
        ...mockClassroom,
        teacherId: mockOtherTeacherId,
      });

      await expect(
        service.create(
          {
            classroomId: mockClassroomId,
            subjectId: mockSubjectId,
            title: 'Tiết học',
          },
          mockTeacherId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject updating schedule owned by another teacher', async () => {
      mockPrisma.teachingPlan.findUnique.mockResolvedValueOnce({
        id: 'plan-other',
        teacherId: mockOtherTeacherId,
      });

      await expect(
        service.update(
          'plan-other',
          { title: 'Tên bài mới' },
          mockTeacherId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
