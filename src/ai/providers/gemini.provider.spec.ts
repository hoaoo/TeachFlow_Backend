import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RequestTimeoutException, ServiceUnavailableException } from '@nestjs/common';
import { GeminiProvider } from './gemini.provider';
import { AiModelRouterService } from '../router/ai-model-router.service';

describe('GeminiProvider', () => {
  let provider: GeminiProvider;
  let router: AiModelRouterService;
  const mockGenerateContent = jest.fn();
  const mockGenerateImages = jest.fn();

  beforeEach(async () => {
    mockGenerateContent.mockReset();
    mockGenerateImages.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiModelRouterService,
        GeminiProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'GEMINI_API_KEY') return 'test_api_key_123';
              if (key === 'GEMMA_MODEL') return 'gemma-4-26b-a4b-it';
              if (key === 'GEMINI_FAST_MODEL') return 'gemini-3.5-flash-lite';
              if (key === 'GEMINI_COMPLEX_MODEL') return 'gemini-3.7-flash';
              if (key === 'GEMINI_TIMEOUT_MS') return '60000';
              return null;
            }),
          },
        },
      ],
    }).compile();

    provider = module.get(GeminiProvider);
    router = module.get(AiModelRouterService);
    (provider as any).aiClient = {
      models: {
        generateContent: mockGenerateContent,
        generateImages: mockGenerateImages,
      },
    };
  });

  describe('Model Routing per Operation', () => {
    it('routes chat, student-comment, and questions to Gemma 4 26B', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Phản hồi sư phạm' });
      await provider.generateText({ operation: 'chat', prompt: 'Xin chào' });
      expect(mockGenerateContent.mock.calls[0][0].model).toBe('gemma-4-26b-a4b-it');

      mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ comment: 'Học sinh chăm chỉ' }) });
      await provider.generateStructured({
        operation: 'student-comment',
        prompt: 'nhận xét',
        schema: {},
        validate: (raw) => raw,
      });
      expect(mockGenerateContent.mock.calls[1][0].model).toBe('gemma-4-26b-a4b-it');

      mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ questions: [] }) });
      await provider.generateStructured({
        operation: 'questions',
        prompt: 'tạo câu hỏi',
        schema: {},
        validate: (raw) => raw,
      });
      expect(mockGenerateContent.mock.calls[2][0].model).toBe('gemma-4-26b-a4b-it');
    });

    it('routes document extraction and import to Gemini 3.5 Flash Lite', async () => {
      mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ data: [] }) });
      await provider.generateStructured({
        operation: 'document-extraction',
        prompt: 'trích xuất văn bản',
        schema: {},
        validate: (raw) => raw,
      });
      expect(mockGenerateContent.mock.calls[0][0].model).toBe('gemini-3.5-flash-lite');

      await provider.generateStructured({
        operation: 'import',
        prompt: 'nhập danh sách học sinh',
        schema: {},
        validate: (raw) => raw,
      });
      expect(mockGenerateContent.mock.calls[1][0].model).toBe('gemini-3.5-flash-lite');
    });

    it('routes lesson-plan, worksheet, and homeroom-summary to Gemini 3.7 Flash', async () => {
      mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ title: 'Kế hoạch bài dạy' }) });
      await provider.generateStructured({
        operation: 'lesson-plan',
        prompt: 'soạn giáo án',
        schema: {},
        validate: (raw) => raw,
      });
      expect(mockGenerateContent.mock.calls[0][0].model).toBe('gemini-3.7-flash');

      await provider.generateStructured({
        operation: 'worksheet',
        prompt: 'tạo phiếu bài tập',
        schema: {},
        validate: (raw) => raw,
      });
      expect(mockGenerateContent.mock.calls[1][0].model).toBe('gemini-3.7-flash');

      await provider.generateStructured({
        operation: 'homeroom-summary',
        prompt: 'báo cáo chủ nhiệm',
        schema: {},
        validate: (raw) => raw,
      });
      expect(mockGenerateContent.mock.calls[2][0].model).toBe('gemini-3.7-flash');
    });
  });

  describe('Fallback Flows', () => {
    it('falls back from Gemma 4 26B (429) directly to Gemini 3.5 Flash Lite', async () => {
      mockGenerateContent
        .mockRejectedValueOnce({ status: 429, message: 'Resource exhausted' })
        .mockResolvedValueOnce({ text: 'Chào thầy cô' });

      const res = await provider.generateText({ operation: 'chat', prompt: 'hi' });
      expect(res).toBe('Chào thầy cô');
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      expect(mockGenerateContent.mock.calls[0][0].model).toBe('gemma-4-26b-a4b-it');
      expect(mockGenerateContent.mock.calls[1][0].model).toBe('gemini-3.5-flash-lite');
    });

    it('falls back from Gemini 3.7 (429) directly to Gemini 3.5 Flash Lite', async () => {
      mockGenerateContent
        .mockRejectedValueOnce({ status: 429, message: 'Resource exhausted' })
        .mockResolvedValueOnce({ text: JSON.stringify({ title: 'Bài học 1' }) });

      const res = await provider.generateStructured({
        operation: 'lesson-plan',
        prompt: 'soạn giáo án',
        schema: {},
        validate: (raw) => raw,
      });

      expect(res).toEqual({ title: 'Bài học 1' });
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      expect(mockGenerateContent.mock.calls[0][0].model).toBe('gemini-3.7-flash');
      expect(mockGenerateContent.mock.calls[1][0].model).toBe('gemini-3.5-flash-lite');
    });

    it('falls back to Gemma when both Gemini 3.7 and Gemini 3.5 fail', async () => {
      mockGenerateContent
        .mockRejectedValueOnce({ status: 429, message: 'Gemini 3.7 rate limited' })
        .mockRejectedValueOnce({ status: 429, message: 'Gemini 3.5 rate limited' })
        .mockResolvedValueOnce({ text: JSON.stringify({ title: 'Bài học từ Gemma' }) });

      const res = await provider.generateStructured({
        operation: 'lesson-plan',
        prompt: 'soạn giáo án',
        schema: {},
        validate: (raw) => raw,
      });

      expect(res).toEqual({ title: 'Bài học từ Gemma' });
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
      expect(mockGenerateContent.mock.calls[0][0].model).toBe('gemini-3.7-flash');
      expect(mockGenerateContent.mock.calls[1][0].model).toBe('gemini-3.5-flash-lite');
      expect(mockGenerateContent.mock.calls[2][0].model).toBe('gemma-4-26b-a4b-it');
    });

    it('does not cause infinite fallback loop when all models fail', async () => {
      mockGenerateContent.mockRejectedValue({ status: 429, message: 'Rate limit exceeded' });

      await expect(
        provider.generateStructured({
          operation: 'lesson-plan',
          prompt: 'soạn giáo án',
          schema: {},
          validate: (raw) => raw,
        }),
      ).rejects.toThrow(ServiceUnavailableException);

      // Total attempts should equal number of models in chain: 3 (3.7 -> 3.5 -> gemma)
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });

    it('retries at most 1 time with backoff on 503 before switching to fallback', async () => {
      jest.spyOn(provider as any, 'sleepWithBackoff').mockResolvedValue(undefined);
      mockGenerateContent
        .mockRejectedValueOnce({ status: 503, message: 'Service unavailable attempt 1' })
        .mockRejectedValueOnce({ status: 503, message: 'Service unavailable attempt 2' })
        .mockResolvedValueOnce({ text: JSON.stringify({ title: 'Thành công từ fallback' }) });

      const res = await provider.generateStructured({
        operation: 'lesson-plan',
        prompt: 'soạn giáo án',
        schema: {},
        validate: (raw) => raw,
      });

      expect(res).toEqual({ title: 'Thành công từ fallback' });
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
      expect(mockGenerateContent.mock.calls[0][0].model).toBe('gemini-3.7-flash');
      expect(mockGenerateContent.mock.calls[1][0].model).toBe('gemini-3.7-flash');
      expect(mockGenerateContent.mock.calls[2][0].model).toBe('gemini-3.5-flash-lite');
    });
  });

  describe('Error handling & image generation', () => {
    it('throws 400 immediately on invalid input without attempting fallbacks', async () => {
      mockGenerateContent.mockRejectedValueOnce({ status: 400, message: 'invalid argument: bad prompt' });

      await expect(
        provider.generateStructured({
          operation: 'lesson-plan',
          prompt: 'invalid',
          schema: {},
          validate: (raw) => raw,
        }),
      ).rejects.toThrow();

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('generates image successfully', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: Buffer.from('image-bytes').toString('base64'), mimeType: 'image/png' } }],
            },
          },
        ],
      });

      const img = await provider.generateImage({ operation: 'image', prompt: 'vẽ tranh' });
      expect(img.mimeType).toBe('image/png');
      expect(img.buffer.toString()).toBe('image-bytes');
    });
  });
});
