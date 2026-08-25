import { Test, TestingModule } from '@nestjs/testing';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AiThrottlerGuard } from './guards/ai-throttler.guard';

describe('AiController', () => {
  let controller: AiController;
  const mockAiService = {
    generateLessonPlan: jest.fn(),
    generateActivity: jest.fn(),
    generateWorksheet: jest.fn(),
    generateQuestions: jest.fn(),
    generateStudentComment: jest.fn(),
    generateImage: jest.fn(),
    analyzeImport: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [{ provide: AiService, useValue: mockAiService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AiThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AiController);
  });

  it('delegates lesson plan generation', async () => {
    const dto = { grade: 4, subject: 'Tiếng Việt', lessonTitle: 'Trong lời mẹ hát' };
    mockAiService.generateLessonPlan.mockResolvedValue({ title: 'Trong lời mẹ hát', activities: [] });
    const result = await controller.generateLessonPlan(dto as any);
    expect(result.title).toBe('Trong lời mẹ hát');
    expect(mockAiService.generateLessonPlan).toHaveBeenCalledWith(dto);
  });

  it('delegates image generation with current user', async () => {
    const user = { teacherId: 't1' } as any;
    mockAiService.generateImage.mockResolvedValue({ resourceId: 'r1' });
    const result = await controller.generateImage({ prompt: 'minh họa phân số' } as any, user);
    expect(result.resourceId).toBe('r1');
    expect(mockAiService.generateImage).toHaveBeenCalled();
  });

  it('delegates import analyze and does not persist', async () => {
    const user = { teacherId: 't1' } as any;
    mockAiService.analyzeImport.mockResolvedValue({ persisted: false, rows: [] });
    const result = await controller.analyzeImport({ originalname: 'ds.xlsx' } as any, { target: 'students' } as any, user);
    expect(result.persisted).toBe(false);
    expect(mockAiService.analyzeImport).toHaveBeenCalled();
  });
});
