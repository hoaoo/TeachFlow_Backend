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
    expect(mockGenerateContent.mock.calls[0][0].model).toBe('gemini-3.6-flash');
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

  it('falls back to gemini-2.5-flash when primary model is not found', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('Model not found: gemini-3.6-flash'));
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify({ title: 'ok' }) });

    const res = await provider.generateStructured({
      operation: 'lesson-plan',
      prompt: 'test',
      schema: {},
      validate: (raw) => raw as any,
    });

    expect(res).toEqual({ title: 'ok' });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockGenerateContent.mock.calls[1][0].model).toBe('gemini-2.5-flash');
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
    mockGenerateContent.mockResolvedValueOnce({ text: '   ' });
    await expect(
      provider.generateStructured({
        operation: 'lesson-plan',
        prompt: 'test',
        schema: {},
        validate: (raw) => raw as any,
        retryCount: 0,
      }),
    ).rejects.toThrow(InternalServerErrorException);
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
    ).rejects.toThrow(InternalServerErrorException);
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
    mockGenerateContent.mockRejectedValueOnce(new Error('api_key_invalid secret=abc'));
    await expect(
      provider.generateStructured({
        operation: 'lesson-plan',
        prompt: 'test',
        schema: {},
        validate: (raw) => raw as any,
        retryCount: 0,
      }),
    ).rejects.toThrow('Không thể tạo nội dung lúc này. Vui lòng thử lại.');
  });

  it('generates an image buffer from base64 bytes', async () => {
    mockGenerateImages.mockResolvedValueOnce({
      generatedImages: [{ image: { imageBytes: Buffer.from('png-data').toString('base64') } }],
    });

    const image = await provider.generateImage({
      operation: 'image',
      prompt: 'minh họa phân số',
      aspectRatio: '1:1',
    });

    expect(image.mimeType).toBe('image/png');
    expect(Buffer.isBuffer(image.buffer)).toBe(true);
    expect(image.buffer.toString()).toBe('png-data');
  });
});
