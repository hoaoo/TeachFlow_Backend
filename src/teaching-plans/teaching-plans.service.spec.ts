import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TeachingPlansService } from './teaching-plans.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TeachingPlansService (Curriculum Plan Domain)', () => {
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
      schedule: {
        create: jest.fn(),
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

  describe('create and domain separation', () => {
    it('creating TeachingPlan must NOT create Schedule', async () => {
      mockPrisma.teachingPlan.create.mockResolvedValueOnce({
        id: 'plan-1',
        teacherId: mockTeacherId,
        classroomId: mockClassroomId,
        subjectId: mockSubjectId,
        schoolYearId: mockSchoolYearId,
        title: 'Kế hoạch môn Toán Khối 4',
        weekNumber: 1,
        numberOfPeriods: 4,
        status: 'PLANNED',
        classroom: mockClassroom,
        subject: mockSubject,
        schoolYear: mockSchoolYear,
      });

      const res = await service.create(
        {
          classroomId: mockClassroomId,
          subjectId: mockSubjectId,
          title: 'Kế hoạch môn Toán Khối 4',
          weekNumber: 1,
          numberOfPeriods: 4,
        },
        mockTeacherId,
      );

      expect(res).toBeDefined();
      expect(res.id).toBe('plan-1');
      expect(mockPrisma.teachingPlan.create).toHaveBeenCalled();
      expect(mockPrisma.schedule.create).not.toHaveBeenCalled();
    });

    it('should reject when subject not found', async () => {
      mockPrisma.subject.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.create(
          {
            classroomId: mockClassroomId,
            subjectId: 'invalid-subject',
            title: 'Kế hoạch',
          },
          mockTeacherId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('security isolation', () => {
    it('should reject creating teaching plan for classroom of another teacher', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValueOnce({
        ...mockClassroom,
        teacherId: mockOtherTeacherId,
      });

      await expect(
        service.create(
          {
            classroomId: mockClassroomId,
            subjectId: mockSubjectId,
            title: 'Kế hoạch',
          },
          mockTeacherId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject updating teaching plan owned by another teacher', async () => {
      mockPrisma.teachingPlan.findUnique.mockResolvedValueOnce({
        id: 'plan-other',
        teacherId: mockOtherTeacherId,
      });

      await expect(
        service.update(
          'plan-other',
          { title: 'Tên mới' },
          mockTeacherId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
