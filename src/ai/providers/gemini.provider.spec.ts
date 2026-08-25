import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RequestTimeoutException, ServiceUnavailableException, InternalServerErrorException } from '@nestjs/common';
import { GeminiProvider } from './gemini.provider';

describe('GeminiProvider', () => {
  let provider: GeminiProvider;
  const mockGenerateContent = jest.fn();
  const mockGenerateImages = jest.fn();

  beforeEach(async () => {
    mockGenerateContent.mockReset();
    mockGenerateImages.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiProvider,
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
      ],
    }).compile();

    provider = module.get(GeminiProvider);
    (provider as any).aiClient = {
      models: {
        generateContent: mockGenerateContent,
        generateImages: mockGenerateImages,
      },
    };
  });

  it('assigns 60s timeout for heavy operations', () => {
    expect(provider.getTimeoutForOperation('lesson-plan')).toBe(60000);
    expect(provider.getTimeoutForOperation('worksheet')).toBe(60000);
  });

  it('assigns 30s timeout for light operations', () => {
    expect(provider.getTimeoutForOperation('activity')).toBe(30000);
    expect(provider.getTimeoutForOperation('questions')).toBe(30000);
    expect(provider.getTimeoutForOperation('student-comment')).toBe(30000);
  });

  it('returns structured data when Gemini responds with valid JSON', async () => {
    const mockResult = { title: 'Trong lời mẹ hát', objectives: 'Mục tiêu', teachingEquipment: 'SGK', activities: [] };
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify(mockResult) });

    const res = await provider.generateStructured({
      operation: 'lesson-plan',
      prompt: 'soạn giáo án',
      schema: {},
      validate: (raw) => raw as typeof mockResult,
    });

    expect(res).toEqual(mockResult);
    expect(mockGenerateContent.mock.calls[0][0].model).toBe('gemini-3.7-flash');
    expect(mockGenerateContent.mock.calls[0][0].config.responseMimeType).toBe('application/json');
  });

  it('never uses gemini-1.5-flash as default model', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify({ ok: true }) });
    await provider.generateStructured({
      operation: 'lesson-plan',
      prompt: 'test',
      schema: {},
      validate: (raw) => raw as any,
    });
    expect(mockGenerateContent.mock.calls[0][0].model).not.toContain('1.5');
  });

  it('throws when API key is not configured', async () => {
    (provider as any).aiClient = null;
    jest.spyOn(provider as any, 'getApiKey').mockReturnValue(null);
    await expect(
      provider.generateStructured({
        operation: 'lesson-plan',
        prompt: 'test',
        schema: {},
        validate: (raw) => raw as any,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('falls back to gemini-3.6-flash when primary model is not found', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('Model not found: gemini-3.7-flash'));
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify({ title: 'ok' }) });

    const res = await provider.generateStructured({
      operation: 'lesson-plan',
      prompt: 'test',
      schema: {},
      validate: (raw) => raw as any,
    });

    expect(res).toEqual({ title: 'ok' });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockGenerateContent.mock.calls[1][0].model).toBe('gemini-3.6-flash');
  });

  it('throws RequestTimeoutException and does not retry on timeout', async () => {
    mockGenerateContent.mockImplementation(() => new Promise(() => {}));
    jest.spyOn(provider, 'getTimeoutForOperation').mockReturnValue(50);

    await expect(
      provider.generateStructured({
        operation: 'lesson-plan',
        prompt: 'test',
        schema: {},
        validate: (raw) => raw as any,
      }),
    ).rejects.toThrow(RequestTimeoutException);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('rejects empty AI response', async () => {
    mockGenerateContent.mockResolvedValue({ text: '   ' });
    await expect(
      provider.generateStructured({
        operation: 'lesson-plan',
        prompt: 'test',
        schema: {},
        validate: (raw) => raw as any,
        retryCount: 0,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('rejects malformed JSON', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'not-json' });
    await expect(
      provider.generateStructured({
        operation: 'lesson-plan',
        prompt: 'test',
        schema: {},
        validate: (raw) => raw as any,
        retryCount: 0,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('retries once when validator rejects the payload', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({ text: JSON.stringify({ bad: true }) })
      .mockResolvedValueOnce({ text: JSON.stringify({ title: 'ok' }) });

    const res = await provider.generateStructured({
      operation: 'lesson-plan',
      prompt: 'test',
      schema: {},
      retryCount: 1,
      validate: (raw: any) => {
        if (!raw.title) throw new Error('Malformed JSON received from model');
        return raw;
      },
    });

    expect(res).toEqual({ title: 'ok' });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('maps provider errors without leaking secrets', async () => {
    mockGenerateContent.mockRejectedValue(new Error('api_key_invalid secret=abc'));
    await expect(
      provider.generateStructured({
        operation: 'lesson-plan',
        prompt: 'test',
        schema: {},
        validate: (raw) => raw as any,
        retryCount: 0,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  describe('generateImage', () => {
    it('generates an image buffer from generateContent inline data (valid path)', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: Buffer.from('png-data').toString('base64'), mimeType: 'image/png' } }],
            },
          },
        ],
      });

      const image = await provider.generateImage({
        operation: 'image',
        prompt: 'minh họa phân số',
        aspectRatio: '1:1',
      });

      expect(image.mimeType).toBe('image/png');
      expect(Buffer.isBuffer(image.buffer)).toBe(true);
      expect(image.buffer.toString()).toBe('png-data');
      expect(mockGenerateContent).toHaveBeenCalled();
      expect(JSON.stringify(mockGenerateContent.mock.calls[0][0])).not.toContain('test_api_key');
    });

    it('returns 503 AI_IMAGE_PROVIDER_UNAVAILABLE when API key is missing', async () => {
      (provider as any).aiClient = null;
      jest.spyOn(provider as any, 'getApiKey').mockReturnValue(null);

      const error: any = await provider.generateImage({ operation: 'image', prompt: 'minh họa' }).catch((e) => e);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({
          statusCode: 503,
          code: 'AI_IMAGE_PROVIDER_UNAVAILABLE',
          message: 'Dịch vụ tạo ảnh AI hiện chưa khả dụng.',
        }),
      );
      expect(JSON.stringify(error.getResponse())).not.toContain('GEMINI_API_KEY');
    });

    it('returns 503 AI_IMAGE_PROVIDER_UNAVAILABLE for invalid/unavailable image model', async () => {
      mockGenerateContent.mockRejectedValueOnce({ status: 404, message: 'Model not found: gemini-3.1-flash-image' });
      jest.spyOn(provider, 'getImageFallbackModelName').mockReturnValue('gemini-3.1-flash-lite-image');

      const error: any = await provider.generateImage({ operation: 'image', prompt: 'minh họa' }).catch((e) => e);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({
          code: 'AI_IMAGE_PROVIDER_UNAVAILABLE',
          message: 'Dịch vụ tạo ảnh AI hiện chưa khả dụng.',
        }),
      );
    });

    it('maps provider 4xx to AI_IMAGE_INVALID_REQUEST without leaking upstream text', async () => {
      mockGenerateContent.mockRejectedValueOnce({ status: 400, message: 'invalid argument secret=abc' });

      const error: any = await provider.generateImage({ operation: 'image', prompt: 'minh họa' }).catch((e) => e);
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({
          code: 'AI_IMAGE_INVALID_REQUEST',
          message: 'Yêu cầu tạo ảnh không hợp lệ. Vui lòng điều chỉnh mô tả và thử lại.',
        }),
      );
      expect(JSON.stringify(error.getResponse())).not.toContain('secret=abc');
    });

    it('maps provider 5xx to AI_IMAGE_UPSTREAM_ERROR', async () => {
      mockGenerateContent.mockRejectedValue({ status: 500, message: 'backend exploded stacktrace' });
      jest.spyOn(provider, 'getImageFallbackModelName').mockReturnValue('gemini-3.1-flash-lite-image');

      const error: any = await provider.generateImage({ operation: 'image', prompt: 'minh họa' }).catch((e) => e);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({
          code: 'AI_IMAGE_UPSTREAM_ERROR',
          message: 'Dịch vụ tạo ảnh AI hiện chưa khả dụng.',
        }),
      );
      expect(JSON.stringify(error.getResponse())).not.toContain('stacktrace');
    });

    it('throws AI_IMAGE_TIMEOUT when the provider call exceeds timeout', async () => {
      mockGenerateContent.mockImplementation(() => new Promise(() => {}));
      jest.spyOn(provider, 'getTimeoutForOperation').mockReturnValue(40);

      const error: any = await provider.generateImage({ operation: 'image', prompt: 'minh họa' }).catch((e) => e);
      expect(error).toBeInstanceOf(RequestTimeoutException);
      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'AI_IMAGE_TIMEOUT' }));
    });

    it('falls back from retired Imagen generateImages to Gemini generateContent', async () => {
      jest.spyOn(provider, 'getImageModelName').mockReturnValue('imagen-4.0-generate-001');
      jest.spyOn(provider, 'getImageFallbackModelName').mockReturnValue('gemini-3.1-flash-image');
      mockGenerateImages.mockRejectedValueOnce(new Error('Imagen models are deprecated and shut down'));
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: Buffer.from('fallback-png').toString('base64'), mimeType: 'image/png' } }],
            },
          },
        ],
      });

      const image = await provider.generateImage({ operation: 'image', prompt: 'minh họa phân số' });
      expect(image.buffer.toString()).toBe('fallback-png');
      expect(mockGenerateImages).toHaveBeenCalled();
      expect(mockGenerateContent).toHaveBeenCalled();
    });
  });
});
