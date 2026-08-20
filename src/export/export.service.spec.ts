import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ExportService } from './export.service';
import { LessonPlanExportService } from './lesson-plan-export.service';
import { WorksheetExportService } from './worksheet-export.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ExportService', () => {
  let service: ExportService;
  let prismaService: PrismaService;
  let lessonPlanExportService: LessonPlanExportService;
  let worksheetExportService: WorksheetExportService;

  const mockTeacher = {
    id: 'teacher-123',
    userId: 'user-123',
    fullName: 'Cô Nguyễn Hà',
  };

  const mockLessonPlan = {
    id: 'plan-1',
    teacherId: 'teacher-123',
    title: 'Trong lời mẹ hát',
    subjectName: 'Tiếng Việt',
    gradeName: 'Lớp 4A',
    weekNumber: 3,
    periodNumber: 1,
    teachingDate: new Date('2026-08-21'),
    durationMinutes: 35,
    objectives: 'Mục tiêu bài dạy',
    teachingEquipment: 'Đồ dùng bài dạy',
    postLessonAdjustment: null,
    deletedAt: null,
    teacher: mockTeacher,
    activities: [
      {
        id: 'act-1',
        phase: 'Khởi động',
        title: 'Trò chơi âm nhạc',
        durationMinutes: 5,
        method: 'Trò chơi',
        technique: 'Động não',
        competencies: 'Giao tiếp',
        qualities: 'Yêu nước',
        objective: 'Khơi gợi hứng thú',
        teacherActivity: 'GV bật nhạc',
        studentActivity: 'HS hát theo',
        sortOrder: 0,
      },
    ],
  };

  const mockWorksheet = {
    id: 'worksheet-1',
    teacherId: 'teacher-123',
    title: 'Phiếu học tập Phân số',
    subtitle: 'Toán · Lớp 4',
    deletedAt: null,
    teacher: mockTeacher,
    subject: { name: 'Toán' },
    grade: { name: 'Khối 4' },
    lesson: { title: 'Phân số bằng nhau' },
    questions: [
      {
        id: 'q-1',
        questionType: 'MULTIPLE_CHOICE',
        content: 'Phân số nào bằng 1/2?',
        optionsJson: ['A. 2/4', 'B. 3/5', 'C. 4/6', 'D. 5/8'],
        correctAnswerJson: 'A. 2/4',
        explanation: 'Vì nhân cả tử và mẫu với 2',
        sortOrder: 0,
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportService,
        LessonPlanExportService,
        WorksheetExportService,
        {
          provide: PrismaService,
          useValue: {
            teacher: {
              findUnique: jest.fn().mockResolvedValue(mockTeacher),
            },
            lessonPlan: {
              findUnique: jest.fn().mockImplementation(({ where }) => {
                if (where.id === 'plan-1') return Promise.resolve(mockLessonPlan);
                if (where.id === 'plan-deleted') return Promise.resolve({ ...mockLessonPlan, deletedAt: new Date() });
                return Promise.resolve(null);
              }),
            },
            worksheet: {
              findUnique: jest.fn().mockImplementation(({ where }) => {
                if (where.id === 'worksheet-1') return Promise.resolve(mockWorksheet);
                return Promise.resolve(null);
              }),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ExportService>(ExportService);
    prismaService = module.get<PrismaService>(PrismaService);
    lessonPlanExportService = module.get<LessonPlanExportService>(LessonPlanExportService);
    worksheetExportService = module.get<WorksheetExportService>(WorksheetExportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('exportLessonPlanDocx', () => {
    it('should generate valid DOCX buffer for owner teacher', async () => {
      const authUser = { userId: 'user-123', email: 'teacher@test.com', role: 'TEACHER' as const, teacherId: 'teacher-123' };
      const res = await service.exportLessonPlanDocx('plan-1', authUser);

      expect(res.buffer).toBeInstanceOf(Buffer);
      expect(res.buffer.length).toBeGreaterThan(0);
      expect(res.asciiFilename).toContain('Giao_an_Trong_loi_me_hat');
      expect(res.asciiFilename).toMatch(/\.docx$/);
    });

    it('should throw NotFoundException if lesson plan does not exist or is deleted', async () => {
      const authUser = { userId: 'user-123', email: 'teacher@test.com', role: 'TEACHER' as const, teacherId: 'teacher-123' };
      await expect(service.exportLessonPlanDocx('non-existent', authUser)).rejects.toThrow(NotFoundException);
      await expect(service.exportLessonPlanDocx('plan-deleted', authUser)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if another teacher tries to export', async () => {
      const otherTeacherUser = {
        userId: 'user-999',
        email: 'other@test.com',
        role: 'TEACHER' as const,
        teacherId: 'teacher-999',
      };
      await expect(service.exportLessonPlanDocx('plan-1', otherTeacherUser)).rejects.toThrow(ForbiddenException);
    });

    it('should allow ADMIN to export any teacher lesson plan', async () => {
      const adminUser = { userId: 'admin-1', email: 'admin@test.com', role: 'ADMIN' as const };
      const res = await service.exportLessonPlanDocx('plan-1', adminUser);

      expect(res.buffer).toBeInstanceOf(Buffer);
      expect(res.buffer.length).toBeGreaterThan(0);
    });
  });

  describe('exportLessonPlanPdf', () => {
    it('should generate valid PDF buffer for owner teacher', async () => {
      const authUser = { userId: 'user-123', email: 'teacher@test.com', role: 'TEACHER' as const, teacherId: 'teacher-123' };
      const res = await service.exportLessonPlanPdf('plan-1', authUser);

      expect(res.buffer).toBeInstanceOf(Buffer);
      expect(res.buffer.length).toBeGreaterThan(0);
      expect(res.asciiFilename).toMatch(/\.pdf$/);
    });
  });

  describe('exportWorksheetDocx & PDF', () => {
    it('should generate DOCX with and without answers', async () => {
      const authUser = { userId: 'user-123', email: 'teacher@test.com', role: 'TEACHER' as const, teacherId: 'teacher-123' };
      const withoutAnswers = await service.exportWorksheetDocx('worksheet-1', authUser, false);
      const withAnswers = await service.exportWorksheetDocx('worksheet-1', authUser, true);

      expect(withoutAnswers.buffer).toBeInstanceOf(Buffer);
      expect(withAnswers.buffer).toBeInstanceOf(Buffer);
      expect(withAnswers.asciiFilename).toContain('_Co_dap_an');
    });

    it('should generate PDF for worksheet', async () => {
      const authUser = { userId: 'user-123', email: 'teacher@test.com', role: 'TEACHER' as const, teacherId: 'teacher-123' };
      const res = await service.exportWorksheetPdf('worksheet-1', authUser, true);

      expect(res.buffer).toBeInstanceOf(Buffer);
      expect(res.buffer.length).toBeGreaterThan(0);
      expect(res.asciiFilename).toMatch(/\.pdf$/);
    });
  });
});
