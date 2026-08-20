import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { HomeroomService } from './homeroom.service';
import { HomeroomExportService } from '../export/homeroom-export.service';
import { PrismaService } from '../prisma/prisma.service';
import { BehaviorCategory, BehaviorLevel } from '@prisma/client';

describe('Homeroom Security & Data Isolation Invariants', () => {
  let service: HomeroomService;
  const teacherAId = 'teacher-A-uuid';
  const teacherBId = 'teacher-B-uuid';
  const classroomBId = 'class-B-uuid';
  const studentBId = 'student-B-uuid';

  const mockPrisma = {
    classroom: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    student: {
      findUnique: jest.fn(),
    },
    classStudent: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    studentBehaviorRecord: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    weeklyClassReview: {
      findUnique: jest.fn(),
    },
    monthlyClassReview: {
      findUnique: jest.fn(),
    },
    schoolYear: {
      findUnique: jest.fn(),
    },
    attendanceSession: {
      findMany: jest.fn(),
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

  describe('1. Dashboard Isolation', () => {
    it('Teacher A should receive ForbiddenException when requesting Dashboard for Teacher B classroom', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: classroomBId,
        teacherId: teacherBId,
        deletedAt: null,
      });

      await expect(service.getDashboard(classroomBId, teacherAId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('2. Students Need Attention Isolation', () => {
    it('Teacher A should receive ForbiddenException when requesting Students Need Attention for Teacher B classroom', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: classroomBId,
        teacherId: teacherBId,
        deletedAt: null,
      });

      await expect(service.getStudentsNeedAttention(classroomBId, teacherAId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('3. Upcoming Birthdays Isolation', () => {
    it('Teacher A should receive ForbiddenException when requesting Birthdays for Teacher B classroom', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: classroomBId,
        teacherId: teacherBId,
        deletedAt: null,
      });

      await expect(service.getUpcomingBirthdays(classroomBId, teacherAId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('4. Behavior Record Cross-Tenant Isolation', () => {
    it('Teacher A should be REJECTED when creating behavior record for Teacher B classroom / student', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: classroomBId,
        teacherId: teacherBId,
        deletedAt: null,
      });

      await expect(
        service.createBehaviorRecord(
          {
            classroomId: classroomBId,
            studentId: studentBId,
            recordDate: '2026-08-20',
            category: BehaviorCategory.DISCIPLINE,
            level: BehaviorLevel.NEEDS_ATTENTION,
            content: 'Attacker behavior',
          },
          teacherAId,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.studentBehaviorRecord.create).not.toHaveBeenCalled();
    });

    it('Teacher A should be REJECTED when updating Teacher B behavior record', async () => {
      mockPrisma.studentBehaviorRecord.findUnique.mockResolvedValue({
        id: 'rec-B',
        teacherId: teacherBId,
      });

      await expect(
        service.updateBehaviorRecord('rec-B', { content: 'Hacked' }, teacherAId),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.studentBehaviorRecord.update).not.toHaveBeenCalled();
    });

    it('Teacher A should be REJECTED when deleting Teacher B behavior record', async () => {
      mockPrisma.studentBehaviorRecord.findUnique.mockResolvedValue({
        id: 'rec-B',
        teacherId: teacherBId,
      });

      await expect(service.deleteBehaviorRecord('rec-B', teacherAId)).rejects.toThrow(
        ForbiddenException,
      );

      expect(mockPrisma.studentBehaviorRecord.delete).not.toHaveBeenCalled();
    });
  });

  describe('5. Weekly & Monthly Review Isolation', () => {
    it('Teacher A should be REJECTED when saving Weekly Review for Teacher B classroom', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: classroomBId,
        teacherId: teacherBId,
        deletedAt: null,
      });

      await expect(
        service.saveWeeklyReview(
          {
            classroomId: classroomBId,
            weekNumber: 2,
            strengths: 'Good',
          },
          teacherAId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Teacher A should be REJECTED when exporting Weekly Review of Teacher B classroom', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: classroomBId,
        teacherId: teacherBId,
        deletedAt: null,
      });

      await expect(
        service.exportWeeklyReview(classroomBId, 2, undefined, teacherAId, 'docx'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Teacher A should be REJECTED when exporting Monthly Summary of Teacher B classroom', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: classroomBId,
        teacherId: teacherBId,
        deletedAt: null,
      });

      await expect(
        service.exportMonthlySummary(classroomBId, 2026, 8, teacherAId, 'pdf'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
