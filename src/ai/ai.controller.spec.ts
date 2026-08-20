import { Test, TestingModule } from '@nestjs/testing';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AiThrottlerGuard } from './guards/ai-throttler.guard';

describe('AiController', () => {
  let controller: AiController;
  let service: AiService;

  const mockAiService = {
    generateLessonPlan: jest.fn(),
    generateActivity: jest.fn(),
    generateWorksheet: jest.fn(),
    generateQuestions: jest.fn(),
    generateStudentComment: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        {
          provide: AiService,
          useValue: mockAiService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AiThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AiController>(AiController);
    service = module.get<AiService>(AiService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /api/ai/lesson-plan', () => {
    it('should delegate to aiService.generateLessonPlan', async () => {
      const dto = { grade: 4, subject: 'Tiếng Việt', lessonTitle: 'Trong lời mẹ hát' };
      const expected = { title: 'Trong lời mẹ hát', activities: [] };
      mockAiService.generateLessonPlan.mockResolvedValue(expected);

      const result = await controller.generateLessonPlan(dto as any);
      expect(result).toEqual(expected);
      expect(mockAiService.generateLessonPlan).toHaveBeenCalledWith(dto);
    });
  });

  describe('POST /api/ai/activity', () => {
    it('should delegate to aiService.generateActivity', async () => {
      const dto = { grade: 4, subject: 'Toán', lessonTitle: 'Phân số bằng nhau', activityType: 'WARM_UP' };
      const expected = { title: 'Khởi động', durationMinutes: 5 };
      mockAiService.generateActivity.mockResolvedValue(expected);

      const result = await controller.generateActivity(dto as any);
      expect(result).toEqual(expected);
      expect(mockAiService.generateActivity).toHaveBeenCalledWith(dto);
    });
  });

  describe('POST /api/ai/worksheet', () => {
    it('should delegate to aiService.generateWorksheet', async () => {
      const dto = { grade: 4, subject: 'Khoa học', lesson: 'Âm thanh' };
      const expected = { title: 'Phiếu học tập', questions: [] };
      mockAiService.generateWorksheet.mockResolvedValue(expected);

      const result = await controller.generateWorksheet(dto as any);
      expect(result).toEqual(expected);
      expect(mockAiService.generateWorksheet).toHaveBeenCalledWith(dto);
    });
  });

  describe('POST /api/ai/questions', () => {
    it('should delegate to aiService.generateQuestions', async () => {
      const dto = { grade: 4, subject: 'Toán', topic: 'Phân số' };
      const expected = { topic: 'Phân số', questions: [] };
      mockAiService.generateQuestions.mockResolvedValue(expected);

      const result = await controller.generateQuestions(dto as any);
      expect(result).toEqual(expected);
      expect(mockAiService.generateQuestions).toHaveBeenCalledWith(dto);
    });
  });

  describe('POST /api/ai/student-comment', () => {
    it('should delegate to aiService.generateStudentComment', async () => {
      const dto = { subject: 'Tiếng Việt', criteria: { Đọc: 'Tốt' } };
      const expected = { comments: ['Em đọc diễn cảm tốt.'], overallAssessment: 'Tốt' };
      mockAiService.generateStudentComment.mockResolvedValue(expected);

      const result = await controller.generateStudentComment(dto as any);
      expect(result).toEqual(expected);
      expect(mockAiService.generateStudentComment).toHaveBeenCalledWith(dto);
    });
  });
});
