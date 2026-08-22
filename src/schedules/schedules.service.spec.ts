import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SchedulesService (Dedicated Schedule Domain)', () => {
  let service: SchedulesService;
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
      $transaction: jest.fn().mockImplementation(async (arg) => {
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }
        if (typeof arg === 'function') {
          return arg(mockPrisma);
        }
        return arg;
      }),
      classroom: {
        findUnique: jest.fn().mockResolvedValue(mockClassroom),
      },
      subject: {
        findUnique: jest.fn().mockResolvedValue(mockSubject),
      },
      schoolYear: {
        findUnique: jest.fn().mockResolvedValue(mockSchoolYear),
      },
      lessonPlan: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'lp-1',
          teacherId: mockTeacherId,
          title: 'Giáo án Toán Bài 1',
          deletedAt: null,
        }),
      },
      attendanceSession: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      schedule: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
      teachingPlan: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SchedulesService>(SchedulesService);
  });

  describe('create schedule and domain separation', () => {
    it('creating Schedule must NOT create TeachingPlan', async () => {
      mockPrisma.schedule.findMany.mockResolvedValueOnce([]);
      mockPrisma.schedule.create.mockResolvedValueOnce({
        id: 'schedule-1',
        teacherId: mockTeacherId,
        classroomId: mockClassroomId,
        subjectId: mockSubjectId,
        schoolYearId: mockSchoolYearId,
        title: 'Tiết 1: Ôn tập phân số',
        plannedDate: new Date('2026-08-25T00:00:00'),
        startTime: '07:00',
        endTime: '07:45',
        status: 'PLANNED',
        classroom: mockClassroom,
        subject: mockSubject,
        schoolYear: mockSchoolYear,
      });

      const res = await service.create(
        {
          classroomId: mockClassroomId,
          subjectId: mockSubjectId,
          title: 'Tiết 1: Ôn tập phân số',
          plannedDate: '2026-08-25',
          startTime: '07:00',
          endTime: '07:45',
        },
        mockTeacherId,
      );

      expect(res).toBeDefined();
      expect(res.id).toBe('schedule-1');
      expect(mockPrisma.schedule.create).toHaveBeenCalled();
      expect(mockPrisma.teachingPlan.create).not.toHaveBeenCalled();
    });

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
      mockPrisma.schedule.findMany.mockResolvedValueOnce([
        {
          id: 'existing-sched-1',
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

    it('should accept adjacent schedule: 07:45–08:30 after 07:00–07:45', async () => {
      mockPrisma.schedule.findMany.mockResolvedValueOnce([
        {
          id: 'existing-sched-1',
          teacherId: mockTeacherId,
          classroomId: mockClassroomId,
          title: 'Tiết 1: Toán',
          plannedDate: new Date('2026-08-25T00:00:00'),
          startTime: '07:00',
          endTime: '07:45',
        },
      ]);

      mockPrisma.schedule.create.mockResolvedValueOnce({
        id: 'new-sched-2',
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
      expect(result.id).toBe('new-sched-2');
      expect(result.startTime).toBe('07:45');
      expect(result.endTime).toBe('08:30');
    });

    it('should create recurring weekly schedules in a transaction', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      mockPrisma.$transaction.mockResolvedValueOnce([
        {
          id: 'rec-1',
          teacherId: mockTeacherId,
          classroomId: mockClassroomId,
          subjectId: mockSubjectId,
          schoolYearId: mockSchoolYearId,
          title: 'Tiết Toán định kỳ',
          plannedDate: new Date('2026-08-24T00:00:00'),
          startTime: '07:00',
          endTime: '07:45',
          status: 'PLANNED',
          recurrenceGroupId: 'grp-1',
          recurrenceType: 'WEEKLY',
          classroom: mockClassroom,
          subject: mockSubject,
          schoolYear: mockSchoolYear,
        },
        {
          id: 'rec-2',
          teacherId: mockTeacherId,
          classroomId: mockClassroomId,
          subjectId: mockSubjectId,
          schoolYearId: mockSchoolYearId,
          title: 'Tiết Toán định kỳ',
          plannedDate: new Date('2026-08-31T00:00:00'),
          startTime: '07:00',
          endTime: '07:45',
          status: 'PLANNED',
          recurrenceGroupId: 'grp-1',
          recurrenceType: 'WEEKLY',
          classroom: mockClassroom,
          subject: mockSubject,
          schoolYear: mockSchoolYear,
        },
      ]);

      const res = await service.create(
        {
          classroomId: mockClassroomId,
          subjectId: mockSubjectId,
          title: 'Tiết Toán định kỳ',
          plannedDate: '2026-08-24',
          startTime: '07:00',
          endTime: '07:45',
          recurrenceType: 'WEEKLY',
          recurrenceEndDate: '2026-08-31',
        },
        mockTeacherId,
      );

      expect(res).toBeDefined();
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(res.recurrenceType).toBe('WEEKLY');
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
      mockPrisma.schedule.findUnique.mockResolvedValueOnce({
        id: 'sched-other',
        teacherId: mockOtherTeacherId,
      });

      await expect(
        service.update(
          'sched-other',
          { title: 'Tên bài mới' },
          mockTeacherId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject viewing schedule owned by another teacher', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValueOnce({
        id: 'sched-other',
        teacherId: mockOtherTeacherId,
      });

      await expect(
        service.findOne('sched-other', mockTeacherId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('duplicate and workflow endpoints', () => {
    it('should duplicate a schedule successfully with new date and time', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValueOnce({
        id: 'orig-1',
        teacherId: mockTeacherId,
        classroomId: mockClassroomId,
        subjectId: mockSubjectId,
        schoolYearId: mockSchoolYearId,
        title: 'Toán nhân bản',
        plannedDate: new Date('2026-08-25T00:00:00'),
        startTime: '07:00',
        endTime: '07:45',
        classroom: mockClassroom,
        subject: mockSubject,
        deletedAt: null,
      });

      mockPrisma.schedule.findMany.mockResolvedValueOnce([]); // no conflicts

      mockPrisma.schedule.create.mockResolvedValueOnce({
        id: 'dup-1',
        teacherId: mockTeacherId,
        classroomId: mockClassroomId,
        subjectId: mockSubjectId,
        schoolYearId: mockSchoolYearId,
        title: 'Toán nhân bản',
        plannedDate: new Date('2026-08-26T00:00:00'),
        startTime: '08:00',
        endTime: '08:45',
        status: 'PLANNED',
        classroom: mockClassroom,
        subject: mockSubject,
        schoolYear: mockSchoolYear,
      });

      const res = await service.duplicate(
        'orig-1',
        {
          plannedDate: '2026-08-26',
          startTime: '08:00',
          endTime: '08:45',
        },
        mockTeacherId,
      );

      expect(res).toBeDefined();
      expect(res.id).toBe('dup-1');
      expect(res.startTime).toBe('08:00');
    });

    it('should link and unlink lesson plan to schedule', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValueOnce({
        id: 'sched-1',
        teacherId: mockTeacherId,
        deletedAt: null,
      });

      mockPrisma.schedule.update.mockResolvedValueOnce({
        id: 'sched-1',
        teacherId: mockTeacherId,
        lessonPlanId: 'lp-1',
        lessonPlan: { id: 'lp-1', title: 'Giáo án Toán', status: 'COMPLETED' },
        classroom: mockClassroom,
        subject: mockSubject,
        schoolYear: mockSchoolYear,
      });

      const res = await service.linkLessonPlan('sched-1', { lessonPlanId: 'lp-1' }, mockTeacherId);
      expect(res.lessonPlanId).toBe('lp-1');

      mockPrisma.schedule.findUnique.mockResolvedValueOnce({
        id: 'sched-1',
        teacherId: mockTeacherId,
        deletedAt: null,
      });

      mockPrisma.schedule.update.mockResolvedValueOnce({
        id: 'sched-1',
        teacherId: mockTeacherId,
        lessonPlanId: null,
        classroom: mockClassroom,
        subject: mockSubject,
        schoolYear: mockSchoolYear,
      });

      const resUnlink = await service.unlinkLessonPlan('sched-1', mockTeacherId);
      expect(resUnlink.lessonPlanId).toBeNull();
    });

    it('should update schedule status to IN_PROGRESS and record actual start time', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValueOnce({
        id: 'sched-1',
        teacherId: mockTeacherId,
        deletedAt: null,
      });

      mockPrisma.schedule.update.mockResolvedValueOnce({
        id: 'sched-1',
        teacherId: mockTeacherId,
        status: 'IN_PROGRESS',
        actualStartTime: '07:05',
        isManualStatus: true,
        classroom: mockClassroom,
        subject: mockSubject,
        schoolYear: mockSchoolYear,
      });

      const res = await service.updateStatus(
        'sched-1',
        { status: 'IN_PROGRESS', actualStartTime: '07:05' },
        mockTeacherId,
      );

      expect(res.status).toBe('IN_PROGRESS');
      expect(res.actualStartTime).toBe('07:05');
      expect(res.isManualStatus).toBe(true);
    });
  });
});
