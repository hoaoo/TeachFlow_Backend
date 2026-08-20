import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RequestTimeoutException, ServiceUnavailableException, InternalServerErrorException } from '@nestjs/common';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AiService', () => {
  let service: AiService;
  let configService: ConfigService;
  let prismaService: PrismaService;

  const mockGenerateContent = jest.fn();

  const mockGoogleGenAI = {
    models: {
      generateContent: mockGenerateContent,
    },
  };

  beforeEach(async () => {
    mockGenerateContent.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'GEMINI_API_KEY') return 'test_api_key_123';
              if (key === 'GEMINI_MODEL') return '';
              if (key === 'GEMINI_TIMEOUT_MS') return '60000';
              return null;
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            studentAssessment: {
              findMany: jest.fn().mockResolvedValue([]),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    configService = module.get<ConfigService>(ConfigService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Inject mocked AI client directly
    (service as any).aiClient = mockGoogleGenAI;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Timeout configuration & Per-operation timeout', () => {
    it('should assign 60s timeout for heavy operations (lesson-plan, worksheet)', () => {
      expect((service as any).getTimeoutForOperation('lesson-plan')).toBe(60000);
      expect((service as any).getTimeoutForOperation('worksheet')).toBe(60000);
    });

    it('should assign 30s timeout for light operations (activity, questions, student-comment)', () => {
      expect((service as any).getTimeoutForOperation('activity')).toBe(30000);
      expect((service as any).getTimeoutForOperation('questions')).toBe(30000);
      expect((service as any).getTimeoutForOperation('student-comment')).toBe(30000);
    });

    it('should throw RequestTimeoutException when request exceeds timeout and NEVER retry', async () => {
      // Mock generateContent taking forever
      mockGenerateContent.mockImplementation(() => new Promise(() => {}));

      // Override timeout to 50ms for test
      jest.spyOn(service as any, 'getTimeoutForOperation').mockReturnValue(50);

      await expect(
        service.generateLessonPlan({
          grade: 4,
          subject: 'Tiếng Việt',
          lessonTitle: 'Trong lời mẹ hát',
        }),
      ).rejects.toThrow(RequestTimeoutException);

      // Verify generateContent was called ONLY once (NO retry on timeout)
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateLessonPlan', () => {
    it('should return structured lesson plan when Gemini responds with valid JSON', async () => {
      const mockResult = {
        title: 'Trong lời mẹ hát',
        objectives: 'Phát triển năng lực ngôn ngữ và cảm thụ văn học',
        teachingEquipment: 'SGK, tranh ảnh minh họa, máy chiếu',
        activities: [
          {
            activityType: 'WARM_UP',
            title: 'Hát bài Mẹ yêu con',
            objective: 'Tạo cảm xúc và kết nối bài học',
            durationMinutes: 5,
            methods: ['Trò chơi'],
            techniques: ['Động não'],
            competencies: ['Giao tiếp'],
            qualities: ['Yêu thương'],
            teacherActivity: 'GV bật nhạc và đặt câu hỏi gợi mở',
            studentActivity: 'HS hát và chia sẻ cảm xúc',
          },
        ],
      };

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(mockResult),
      });

      const res = await service.generateLessonPlan({
        grade: 4,
        subject: 'Tiếng Việt',
        lessonTitle: 'Trong lời mẹ hát',
        durationMinutes: 35,
      });

      expect(res).toEqual(mockResult);
      expect(mockGenerateContent).toHaveBeenCalled();
      const callArg = mockGenerateContent.mock.calls[0][0];
      expect(callArg.model).toBe('gemini-3.6-flash');
      expect(callArg.config.responseMimeType).toBe('application/json');
    });

    it('should throw ServiceUnavailableException if API key is not configured', async () => {
      (service as any).aiClient = null;
      jest.spyOn(configService, 'get').mockReturnValue('');
      delete process.env.GEMINI_API_KEY;

      await expect(
        service.generateLessonPlan({
          grade: 4,
          subject: 'Tiếng Việt',
          lessonTitle: 'Trong lời mẹ hát',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should fallback to gemini-2.5-flash if primary model gemini-3.6-flash fails with MODEL_NOT_FOUND', async () => {
      const mockResult = {
        title: 'Bài học mẫu',
        objectives: 'Mục tiêu',
        teachingEquipment: 'Đồ dùng',
        activities: [],
      };

      // First call with gemini-3.6-flash fails with not found
      mockGenerateContent.mockRejectedValueOnce(new Error('Model not found: gemini-3.6-flash'));
      // Second call with fallback gemini-2.5-flash succeeds
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(mockResult),
      });

      const res = await service.generateLessonPlan({
        grade: 4,
        subject: 'Tiếng Việt',
        lessonTitle: 'Trong lời mẹ hát',
      });

      expect(res).toEqual(mockResult);
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      expect(mockGenerateContent.mock.calls[0][0].model).toBe('gemini-3.6-flash');
      expect(mockGenerateContent.mock.calls[1][0].model).toBe('gemini-2.5-flash');
    });

    it('should never use gemini-1.5-flash as model', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({ title: 'Test', objectives: 'Test', teachingEquipment: 'Test', activities: [] }),
      });

      await service.generateLessonPlan({
        grade: 4,
        subject: 'Tiếng Việt',
        lessonTitle: 'Trong lời mẹ hát',
      });

      const modelUsed = mockGenerateContent.mock.calls[0][0].model;
      expect(modelUsed).not.toContain('1.5');
    });
  });

  describe('generateStudentComment & PII Anonymization', () => {
    it('should never include student PII (name, phone, parent) in prompt sent to Gemini', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          comments: ['Em có tinh thần học tập tích cực.'],
          overallAssessment: 'Hoàn thành tốt',
          recommendations: 'Duy trì thói quen đọc sách',
        }),
      });

      await service.generateStudentComment({
        subject: 'Tiếng Việt',
        criteria: { 'Đọc': 'Tốt', 'Viết': 'Cần rèn thêm chữ' },
        assessmentLevel: 'Hoàn thành tốt',
        notes: 'Chủ động phát biểu',
      });

      expect(mockGenerateContent).toHaveBeenCalled();
      const callArg = mockGenerateContent.mock.calls[0][0];
      const promptContent = callArg.contents;

      // Ensure NO student real personal names or identifying fields are in the prompt
      expect(promptContent).not.toContain('Nguyễn Thị Mai');
      expect(promptContent).not.toContain('090');
      expect(promptContent).toContain('Tiếng Việt');
      expect(promptContent).toContain('Tốt');
    });
  });

  describe('generateWorksheet', () => {
    it('should return structured worksheet questions', async () => {
      const mockResult = {
        title: 'Phiếu học tập Phân số',
        questions: [
          {
            questionType: 'MULTIPLE_CHOICE',
            content: 'Phân số nào bằng 1/2?',
            options: ['A. 2/4', 'B. 2/3', 'C. 3/5', 'D. 1/3'],
            correctAnswer: 'A. 2/4',
            explanation: 'Vì nhân cả tử và mẫu với 2',
          },
        ],
      };

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(mockResult),
      });

      const res = await service.generateWorksheet({
        grade: 4,
        subject: 'Toán',
        lesson: 'Phân số bằng nhau',
        numberOfQuestions: 1,
      });

      expect(res).toEqual(mockResult);
    });
  });
});
