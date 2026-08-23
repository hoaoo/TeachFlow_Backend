import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { HomeroomService } from './homeroom.service';
import { HomeroomExportService } from '../export/homeroom-export.service';
import { PrismaService } from '../prisma/prisma.service';
import { BehaviorCategory, BehaviorLevel, ParentContactMethod } from '@prisma/client';

describe('HomeroomService', () => {
  let service: HomeroomService;

  const mockPrisma = {
    classroom: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    student: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    classStudent: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    studentEnrollment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    attendanceSession: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    studentBehaviorRecord: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    teacherTask: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    parentContactLog: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    weeklyClassReview: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    monthlyClassReview: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    schoolYear: {
      findUnique: jest.fn(),
    },
    assessment: {
      findMany: jest.fn(),
    },
  };

  const mockExportService = {
    generateWeeklyReviewDocx: jest.fn().mockResolvedValue(Buffer.from('docx')),
    generateWeeklyReviewPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    generateMonthlySummaryDocx: jest.fn().mockResolvedValue(Buffer.from('docx')),
    generateMonthlySummaryPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeroomService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HomeroomExportService, useValue: mockExportService },
      ],
    }).compile();

    service = module.get<HomeroomService>(HomeroomService);
  });

  describe('1. Scope & Ownership Validation', () => {
    it('returns an empty homeroom response instead of selecting an arbitrary class', async () => {
      mockPrisma.classroom.findMany.mockResolvedValue([]);

      await expect(service.getMyHomerooms('t1')).resolves.toEqual({
        hasHomeroomClass: false,
        classes: [],
      });
      expect(mockPrisma.classroom.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ homeroomTeacherId: 't1' }),
        }),
      );
    });

    it('dashboard without classroom id is a graceful empty state and runs no detail query', async () => {
      await expect(service.getDashboard(undefined, 't1')).resolves.toEqual(
        expect.objectContaining({ hasHomeroomClass: false, classroom: null }),
      );
      expect(mockPrisma.classroom.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.classroom.findUnique).not.toHaveBeenCalled();
    });

    it('validateClassroomOwnership should throw NotFoundException if classroom not found', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue(null);
      await expect(service.validateClassroomOwnership('c1', 't1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('validateClassroomOwnership should throw ForbiddenException if classroom belongs to another teacher', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'c1',
        teacherId: 't2',
        homeroomTeacherId: 't2',
        deletedAt: null,
      });
      await expect(service.validateClassroomOwnership('c1', 't1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('validateStudentInClassroom should throw ForbiddenException if student not active in class', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'c1',
        teacherId: 't1',
        homeroomTeacherId: 't1',
        deletedAt: null,
      });
      mockPrisma.student.findUnique.mockResolvedValue({
        id: 's1',
        deletedAt: null,
      });
      mockPrisma.studentEnrollment.findFirst.mockResolvedValue(null);

      await expect(service.validateStudentInClassroom('s1', 'c1', 't1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('2. Students Need Attention Rule Engine', () => {
    it('should flag students with unexcused absence, late, needs support assessment and reminder behaviors', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'c1',
        teacherId: 't1',
        homeroomTeacherId: 't1',
        deletedAt: null,
      });

      mockPrisma.studentEnrollment.findMany.mockResolvedValue([
        {
          classroomId: 'c1',
          status: 'ACTIVE',
          student: {
            id: 's1',
            fullName: 'Nguyen Van An',
            studentAttendances: [
              { status: 'UNEXCUSED_ABSENCE', createdAt: new Date() },
              { status: 'LATE', createdAt: new Date() },
              { status: 'LATE', createdAt: new Date() },
            ],
            studentAssessments: [
              { level: 'NEEDS_SUPPORT', assessment: { title: 'Toan Giua Ky' } },
            ],
            behaviorRecords: [
              { level: 'NEEDS_ATTENTION' },
              { level: 'REMINDER' },
              { level: 'REMINDER' },
            ],
          },
        },
      ]);

      const list = await service.getStudentsNeedAttention('c1', 't1');
      expect(list.length).toBe(1);
      expect(list[0].studentName).toBe('Nguyen Van An');
      expect(list[0].reasons.length).toBe(5); // unexcused, late, assessment, needs_attention, reminders
    });
  });

  describe('3. Upcoming Birthdays', () => {
    it('should correctly calculate upcoming birthdays within 30 days', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'c1',
        teacherId: 't1',
        homeroomTeacherId: 't1',
        deletedAt: null,
      });

      const today = new Date();
      const in5Days = new Date(today);
      in5Days.setDate(in5Days.getDate() + 5);

      mockPrisma.studentEnrollment.findMany.mockResolvedValue([
        {
          classroomId: 'c1',
          status: 'ACTIVE',
          student: {
            id: 's1',
            fullName: 'Tran Gia Bao',
            dateOfBirth: in5Days,
            dobString: `${in5Days.getDate()}/${in5Days.getMonth() + 1}/2016`,
          },
        },
      ]);

      const birthdays = await service.getUpcomingBirthdays('c1', 't1', 30);
      expect(birthdays.length).toBe(1);
      expect(birthdays[0].daysUntilBirthday).toBe(5);
    });
  });

  describe('4. Behavior Records CRUD', () => {
    it('createBehaviorRecord should validate scope and save record', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'c1',
        teacherId: 't1',
        homeroomTeacherId: 't1',
        deletedAt: null,
      });
      mockPrisma.student.findUnique.mockResolvedValue({
        id: 's1',
        deletedAt: null,
      });
      mockPrisma.studentEnrollment.findFirst.mockResolvedValue({
        classroomId: 'c1',
        studentId: 's1',
        status: 'ACTIVE',
      });
      mockPrisma.studentBehaviorRecord.create.mockResolvedValue({
        id: 'b1',
        classroomId: 'c1',
        studentId: 's1',
        teacherId: 't1',
        homeroomTeacherId: 't1',
        recordDate: new Date('2026-08-20'),
        category: BehaviorCategory.TEAMWORK,
        level: BehaviorLevel.POSITIVE,
        content: 'Hop tac tot',
        createdAt: new Date(),
        student: { fullName: 'Nguyen Van An', initials: 'NA', avatarColor: 'teal' },
        classroom: { name: '4A' },
      });

      const result = await service.createBehaviorRecord(
        {
          classroomId: 'c1',
          studentId: 's1',
          recordDate: '2026-08-20',
          category: BehaviorCategory.TEAMWORK,
          level: BehaviorLevel.POSITIVE,
          content: 'Hop tac tot',
        },
        't1',
      );

      expect(result.id).toBe('b1');
      expect(result.category).toBe('TEAMWORK');
    });
  });

  describe('5. Weekly Review Optimistic Concurrency', () => {
    it('saveWeeklyReview should throw ConflictException if version does not match', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'c1',
        teacherId: 't1',
        homeroomTeacherId: 't1',
        schoolYearId: 'sy1',
        deletedAt: null,
      });

      mockPrisma.weeklyClassReview.findUnique.mockResolvedValue({
        id: 'w1',
        classroomId: 'c1',
        schoolYearId: 'sy1',
        weekNumber: 3,
        version: 2, // Current in DB is 2
      });

      await expect(
        service.saveWeeklyReview(
          {
            classroomId: 'c1',
            weekNumber: 3,
            version: 1, // Stale client sent version 1
          },
          't1',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('6. Homeroom tasks and parent contacts', () => {
    beforeEach(() => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'c1',
        teacherId: 't1',
        homeroomTeacherId: 't1',
        schoolYearId: 'sy1',
        deletedAt: null,
      });
    });

    it('creates a task scoped to the homeroom classroom', async () => {
      mockPrisma.teacherTask.create.mockResolvedValue({
        id: 'task-1',
        classroomId: 'c1',
        teacherId: 't1',
        title: 'Chuẩn bị họp phụ huynh',
        priority: 'HIGH',
        dueDate: '2026-08-30',
      });

      const task = await service.createHomeroomTask(
        'c1',
        { title: 'Chuẩn bị họp phụ huynh', priority: 'HIGH', dueDate: '2026-08-30' },
        't1',
      );

      expect(task.classroomId).toBe('c1');
      expect(mockPrisma.teacherTask.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ classroomId: 'c1', teacherId: 't1' }) }),
      );
    });

    it('rejects a cross-class student before writing a parent contact', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({ id: 's2', deletedAt: null });
      mockPrisma.studentEnrollment.findFirst.mockResolvedValue(null);

      await expect(
        service.createParentContact(
          'c1',
          {
            studentId: 's2',
            contactDate: '2026-08-23',
            method: ParentContactMethod.PHONE,
            content: 'Trao đổi tình hình chuyên cần',
          },
          't1',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.parentContactLog.create).not.toHaveBeenCalled();
    });

    it('rejects updating a parent contact from another classroom', async () => {
      mockPrisma.parentContactLog.findUnique.mockResolvedValue({
        id: 'contact-2',
        classroomId: 'c2',
        teacherId: 't1',
      });

      await expect(
        service.updateParentContact('c1', 'contact-2', { outcome: 'Changed' }, 't1'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.parentContactLog.update).not.toHaveBeenCalled();
    });
  });
});
