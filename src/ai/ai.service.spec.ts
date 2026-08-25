import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';
import { GeminiProvider } from './providers/gemini.provider';
import { LessonPlanAiService } from './lesson-plan-ai.service';
import { WorksheetAiService } from './worksheet-ai.service';
import { ImageAiService } from './image-ai.service';
import { ImportAiService } from './import-ai.service';

describe('AiService', () => {
  let service: AiService;
  const mockProvider = {
    generateStructured: jest.fn(),
    generateText: jest.fn(),
    generateImage: jest.fn(),
  };
  const mockLessonPlanAi = {
    generate: jest.fn(),
    toEditorDraft: jest.fn().mockReturnValue({ title: 'Draft' }),
  };
  const mockWorksheetAi = {
    generate: jest.fn(),
    toEditorDraft: jest.fn().mockReturnValue({ title: 'WS' }),
  };
  const mockClassroomAccess = {
    getAccessibleClassroomIds: jest.fn(),
  };
  const mockPrisma = {
    studentAssessment: { findMany: jest.fn().mockResolvedValue([]) },
    studentEnrollment: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: GeminiProvider, useValue: mockProvider },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TeachingAssignmentAuthorizationService, useValue: mockClassroomAccess },
        { provide: LessonPlanAiService, useValue: mockLessonPlanAi },
        { provide: WorksheetAiService, useValue: mockWorksheetAi },
        { provide: ImageAiService, useValue: { generate: jest.fn() } },
        { provide: ImportAiService, useValue: { analyze: jest.fn() } },
      ],
    }).compile();

    service = module.get(AiService);
  });

  it('returns validated lesson plan plus editor draft without writing DB', async () => {
    mockLessonPlanAi.generate.mockResolvedValue({
      title: 'Trong lời mẹ hát',
      objectives: 'Mục tiêu',
      teachingEquipment: 'SGK',
      activities: [],
    });

    const res = await service.generateLessonPlan({
      grade: 4,
      subject: 'Tiếng Việt',
      lessonTitle: 'Trong lời mẹ hát',
    });

    expect(res.title).toBe('Trong lời mẹ hát');
    expect(res.editorDraft).toEqual({ title: 'Draft' });
    expect(mockLessonPlanAi.generate).toHaveBeenCalled();
  });

  it('does not include student PII in the student-comment prompt', async () => {
    mockProvider.generateStructured.mockResolvedValue({
      comments: ['Em có tinh thần học tập tích cực.'],
      overallAssessment: 'Hoàn thành tốt',
      recommendations: 'Duy trì thói quen đọc sách',
    });

    await service.generateStudentComment({
      subject: 'Tiếng Việt',
      criteria: { Đọc: 'Tốt', Viết: 'Cần rèn thêm chữ' },
      assessmentLevel: 'Hoàn thành tốt',
      notes: 'Chủ động phát biểu',
    });

    const prompt = mockProvider.generateStructured.mock.calls[0][0].prompt;
    expect(prompt).not.toContain('Nguyễn Thị Mai');
    expect(prompt).not.toContain('090');
    expect(prompt).toContain('Tiếng Việt');
  });

  it('blocks student-comment generation for a student outside teacher scope', async () => {
    mockClassroomAccess.getAccessibleClassroomIds.mockResolvedValue(['class-A']);
    mockPrisma.studentEnrollment.findFirst.mockResolvedValue(null);

    await expect(
      service.generateStudentComment(
        { studentId: 'student-B', subject: 'Toán' },
        { userId: 'u1', email: 'a@test.com', role: 'TEACHER', teacherId: 'teacher-A' },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(mockProvider.generateStructured).not.toHaveBeenCalled();
  });
});
