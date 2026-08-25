import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  RequestTimeoutException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Schema } from '@google/genai';
import {
  AiProvider,
  GenerateImageOptions,
  GenerateStructuredOptions,
  GenerateTextOptions,
  GeneratedImage,
} from './ai-provider.interface';
import { SYSTEM_INSTRUCTION } from '../prompts/system.prompt';

@Injectable()
export class GeminiProvider implements AiProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private aiClient: GoogleGenAI | null = null;
  private readonly DEFAULT_BASE_TIMEOUT_MS = 60000;
  private readonly DEFAULT_LIGHT_TIMEOUT_MS = 30000;
  private readonly DEFAULT_IMAGE_TIMEOUT_MS = 90000;
  private readonly DEFAULT_MAX_INPUT_CHARS = 20000;
  private readonly DEFAULT_MAX_OUTPUT_TOKENS = 8192;

  constructor(private configService: ConfigService) {
    this.initClient();
  }

  private initClient() {
    const apiKey = this.getApiKey();
    if (apiKey) {
      this.aiClient = new GoogleGenAI({ apiKey });
      this.logger.log('Google Gen AI SDK initialized successfully');
    } else {
      this.logger.warn(
        'GEMINI_API_KEY is not set. Real AI generation will require setting this environment variable.',
      );
    }
  }

  private getApiKey(): string | null {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
    if (apiKey && apiKey.trim() !== '') {
      return apiKey.trim();
    }
    return null;
  }

  private getEnvNumber(key: string, fallback: number): number {
    const configured = this.configService.get<string>(key) || process.env[key];
    if (configured) {
      const parsed = parseInt(configured, 10);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
    return fallback;
  }

  private getEnvString(key: string): string | null {
    const value = this.configService.get<string>(key) || process.env[key];
    if (value && value.trim() !== '') return value.trim();
    return null;
  }

  private getBaseTimeoutMs(): number {
    return this.getEnvNumber('GEMINI_TIMEOUT_MS', this.DEFAULT_BASE_TIMEOUT_MS);
  }

  getTimeoutForOperation(operation: string): number {
    const baseTimeout = this.getBaseTimeoutMs();
    if (operation === 'image') {
      return this.getEnvNumber('GEMINI_IMAGE_TIMEOUT_MS', Math.max(baseTimeout, this.DEFAULT_IMAGE_TIMEOUT_MS));
    }
    if (operation === 'lesson-plan' || operation === 'worksheet' || operation === 'import') {
      return baseTimeout;
    }
    return Math.min(this.DEFAULT_LIGHT_TIMEOUT_MS, baseTimeout);
  }

  getModelName(): string {
    return this.getEnvString('GEMINI_MODEL') || this.getEnvString('GEMINI_PRIMARY_MODEL') || 'gemini-3.6-flash';
  }

  getFallbackModelName(): string {
    return this.getEnvString('GEMINI_FALLBACK_MODEL') || 'gemini-2.5-flash';
  }

  getImageModelName(): string {
    return this.getEnvString('GEMINI_IMAGE_MODEL') || 'gemini-2.5-flash-image';
  }

  getImageFallbackModelName(): string {
    return this.getEnvString('GEMINI_IMAGE_FALLBACK_MODEL') || 'gemini-2.5-flash-image';
  }

  private isImagenModel(model: string): boolean {
    return model.toLowerCase().startsWith('imagen-');
  }

  private logImageEvent(params: {
    model: string;
    stage: string;
    statusCode: number;
    errorCode: string;
    durationMs: number;
  }) {
    const line =
      `[AI] feature=image-generate provider=gemini model=${params.model} stage=${params.stage} ` +
      `statusCode=${params.statusCode} errorCode=${params.errorCode} durationMs=${params.durationMs}`;
    if (params.statusCode >= 500) {
      this.logger.error(line);
    } else if (params.statusCode >= 400) {
      this.logger.warn(line);
    } else {
      this.logger.log(line);
    }
  }

  getMaxInputChars(): number {
    return this.getEnvNumber('GEMINI_MAX_INPUT_CHARS', this.DEFAULT_MAX_INPUT_CHARS);
  }

  getMaxOutputTokens(): number {
    return this.getEnvNumber('GEMINI_MAX_OUTPUT_TOKENS', this.DEFAULT_MAX_OUTPUT_TOKENS);
  }

  categorizeError(error: any): string {
    if (
      error instanceof RequestTimeoutException ||
      error?.name === 'RequestTimeoutException' ||
      error?.message?.includes('vượt quá thời gian') ||
      error?.message?.includes('timed out') ||
      error?.message?.includes('timeout')
    ) {
      return 'TIMEOUT';
    }
    const msg = String(error?.message || '').toLowerCase();
    const status = error?.status || error?.statusCode;
    if (status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('resource_exhausted')) {
      return 'QUOTA_EXCEEDED';
    }
    if (
      status === 404 ||
      msg.includes('not found') ||
      msg.includes('not supported') ||
      msg.includes('deprecated') ||
      msg.includes('shut down') ||
      msg.includes('shutdown') ||
      msg.includes('retired')
    ) {
      return 'MODEL_NOT_FOUND';
    }
    if (
      msg.includes('malformed json') ||
      msg.includes('json.parse') ||
      msg.includes('empty response') ||
      msg.includes('không đúng định dạng')
    ) {
      return 'PARSE_ERROR';
    }
    if (status === 400 || msg.includes('invalid argument') || msg.includes('prompt is too')) {
      return 'INVALID_INPUT';
    }
    if (status === 401 || status === 403 || msg.includes('api_key_invalid') || msg.includes('permission_denied')) {
      return 'AUTH_ERROR';
    }
    if (status === 503 || msg.includes('service unavailable')) {
      return 'SERVICE_UNAVAILABLE';
    }
    return 'UPSTREAM_ERROR';
  }

  private assertClientReady(operation: string) {
    if (!this.aiClient || !this.getApiKey()) {
      this.logger.warn(
        `[AI] operation=${operation} model=none elapsedMs=0 status=UNAVAILABLE errorCategory=UNCONFIGURED_API_KEY`,
      );
      throw new ServiceUnavailableException(
        'Hệ thống AI chưa được cấu hình GEMINI_API_KEY ở backend. Vui lòng cấu hình khóa API trong file .env',
      );
    }
  }

  private assertPromptSize(prompt: string) {
    const maxChars = this.getMaxInputChars();
    if (prompt && prompt.length > maxChars) {
      throw new BadRequestException(
        `Nội dung gửi tới AI vượt quá giới hạn cho phép (${maxChars} ký tự). Vui lòng rút gọn yêu cầu hoặc tệp nguồn.`,
      );
    }
  }

  private buildContents(prompt: string, inlineParts?: GenerateStructuredOptions<unknown>['inlineParts']) {
    if (!inlineParts || inlineParts.length === 0) {
      return prompt;
    }
    return [
      {
        role: 'user',
        parts: [
          { text: prompt },
          ...inlineParts.map((part) => ({
            inlineData: {
              mimeType: part.mimeType,
              data: part.data,
            },
          })),
        ],
      },
    ];
  }

  private async withTimeout<T>(operation: string, timeoutMs: number, work: () => Promise<T>): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new RequestTimeoutException(
            `Yêu cầu AI (${operation}) vượt quá thời gian cho phép (${Math.round(timeoutMs / 1000)} giây)`,
          ),
        );
      }, timeoutMs);
    });
    try {
      return await Promise.race([work(), timeoutPromise]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  async generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<T> {
    const { operation, prompt, schema, validate, inlineParts } = options;
    const retryCount = options.retryCount ?? 1;
    this.assertClientReady(operation);
    this.assertPromptSize(prompt);

    const modelToUse = this.getModelName();
    const timeoutMs = options.timeoutMs ?? this.getTimeoutForOperation(operation);
    const startTime = Date.now();

    const runCall = async (model: string): Promise<T> => {
      const response = await this.withTimeout(operation, timeoutMs, () =>
        this.aiClient!.models.generateContent({
          model,
          contents: this.buildContents(prompt, inlineParts) as any,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: schema as Schema,
            temperature: 0.7,
            maxOutputTokens: this.getMaxOutputTokens(),
          },
        }),
      );

      const rawText = response.text?.trim();
      if (!rawText) {
        throw new Error('Gemini returned an empty response');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        throw new Error('Malformed JSON received from model');
      }

      return validate(parsed);
    };

    try {
      const result = await runCall(modelToUse);
      this.logger.log(
        `[AI] operation=${operation} model=${modelToUse} elapsedMs=${Date.now() - startTime} status=SUCCESS`,
      );
      return result;
    } catch (error: any) {
      const errorCategory = this.categorizeError(error);
      this.logger.error(
        `[AI] operation=${operation} model=${modelToUse} elapsedMs=${Date.now() - startTime} status=FAILED errorCategory=${errorCategory}`,
      );

      const fallbackModel = this.getFallbackModelName();
      if (modelToUse !== fallbackModel && errorCategory === 'MODEL_NOT_FOUND') {
        this.logger.warn(`[AI] operation=${operation} model=${modelToUse} falling back to ${fallbackModel}`);
        try {
          const fallbackResult = await runCall(fallbackModel);
          this.logger.log(
            `[AI] operation=${operation} model=${fallbackModel} elapsedMs=${Date.now() - startTime} status=SUCCESS`,
          );
          return fallbackResult;
        } catch (fallbackError: any) {
          const fallbackCategory = this.categorizeError(fallbackError);
          this.logger.error(
            `[AI] operation=${operation} model=${fallbackModel} elapsedMs=${Date.now() - startTime} status=FAILED errorCategory=${fallbackCategory}`,
          );
        }
      }

      if (errorCategory === 'TIMEOUT' || error instanceof RequestTimeoutException) {
        throw error;
      }
      if (errorCategory === 'INVALID_INPUT' && error instanceof BadRequestException) {
        throw error;
      }

      if (
        retryCount > 0 &&
        errorCategory !== 'AUTH_ERROR' &&
        errorCategory !== 'QUOTA_EXCEEDED' &&
        errorCategory !== 'MODEL_NOT_FOUND'
      ) {
        this.logger.warn(`[AI] operation=${operation} retrying generation (${retryCount} attempt left)...`);
        return this.generateStructured({ ...options, retryCount: retryCount - 1 });
      }

      if (errorCategory === 'PARSE_ERROR') {
        throw new InternalServerErrorException(
          'AI trả về dữ liệu không đúng định dạng. Vui lòng thử lại.',
        );
      }

      throw new InternalServerErrorException('Không thể tạo nội dung lúc này. Vui lòng thử lại.');
    }
  }

  async generateText(options: GenerateTextOptions): Promise<string> {
    const { operation, prompt, inlineParts } = options;
    const retryCount = options.retryCount ?? 1;
    this.assertClientReady(operation);
    this.assertPromptSize(prompt);

    const modelToUse = this.getModelName();
    const timeoutMs = options.timeoutMs ?? this.getTimeoutForOperation(operation);
    const startTime = Date.now();

    const runCall = async (model: string): Promise<string> => {
      const response = await this.withTimeout(operation, timeoutMs, () =>
        this.aiClient!.models.generateContent({
          model,
          contents: this.buildContents(prompt, inlineParts) as any,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.4,
            maxOutputTokens: this.getMaxOutputTokens(),
          },
        }),
      );
      const rawText = response.text?.trim();
      if (!rawText) {
        throw new Error('Gemini returned an empty response');
      }
      return rawText;
    };

    try {
      const result = await runCall(modelToUse);
      this.logger.log(
        `[AI] operation=${operation} model=${modelToUse} elapsedMs=${Date.now() - startTime} status=SUCCESS`,
      );
      return result;
    } catch (error: any) {
      const errorCategory = this.categorizeError(error);
      this.logger.error(
        `[AI] operation=${operation} model=${modelToUse} elapsedMs=${Date.now() - startTime} status=FAILED errorCategory=${errorCategory}`,
      );

      if (errorCategory === 'TIMEOUT' || error instanceof RequestTimeoutException) {
        throw error;
      }
      if (retryCount > 0 && errorCategory !== 'AUTH_ERROR' && errorCategory !== 'QUOTA_EXCEEDED') {
        return this.generateText({ ...options, retryCount: retryCount - 1 });
      }
      throw new InternalServerErrorException('Không thể tạo nội dung lúc này. Vui lòng thử lại.');
    }
  }

  async generateImage(options: GenerateImageOptions): Promise<GeneratedImage> {
    const { operation, prompt } = options;
    const startTime = Date.now();
    let model = this.getImageModelName();
    let stage = 'config';

    if (!this.aiClient || !this.getApiKey()) {
      this.logImageEvent({
        model: 'none',
        stage,
        statusCode: 503,
        errorCode: 'AI_IMAGE_PROVIDER_UNAVAILABLE',
        durationMs: Date.now() - startTime,
      });
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'AI_IMAGE_PROVIDER_UNAVAILABLE',
        message: 'Dịch vụ tạo ảnh AI hiện chưa khả dụng.',
      });
    }

    this.assertPromptSize(prompt);

    const timeoutMs = options.timeoutMs ?? this.getTimeoutForOperation('image');
    const aspectRatio = options.aspectRatio || '1:1';
    const imagePrompt =
      aspectRatio && aspectRatio !== '1:1'
        ? `${prompt}\nTỷ lệ khung hình: ${aspectRatio}.`
        : prompt;

    const decodeImageBytes = (raw: unknown, mimeType?: string): GeneratedImage => {
      stage = 'decode';
      if (raw === undefined || raw === null || raw === '') {
        throw new Error('Gemini returned an empty response');
      }
      let buffer: Buffer;
      if (Buffer.isBuffer(raw)) {
        buffer = raw;
      } else if (raw instanceof Uint8Array) {
        buffer = Buffer.from(raw);
      } else {
        buffer = Buffer.from(String(raw), 'base64');
      }
      if (!buffer.length) {
        throw new Error('Gemini returned an empty response');
      }
      return { buffer, mimeType: mimeType || 'image/png' };
    };

    const generateViaImagen = async (imageModel: string): Promise<GeneratedImage> => {
      stage = 'provider_api';
      if (typeof this.aiClient!.models.generateImages !== 'function') {
        const err: any = new Error('Image generation method is not supported');
        err.status = 404;
        throw err;
      }
      const response = await this.withTimeout(operation, timeoutMs, () =>
        this.aiClient!.models.generateImages({
          model: imageModel,
          prompt: imagePrompt,
          config: {
            numberOfImages: 1,
            aspectRatio,
            outputMimeType: 'image/png',
          },
        }),
      );
      const imageBytes = response?.generatedImages?.[0]?.image?.imageBytes;
      return decodeImageBytes(imageBytes, 'image/png');
    };

    const generateViaContent = async (imageModel: string): Promise<GeneratedImage> => {
      stage = 'provider_api';
      const response = await this.withTimeout(operation, timeoutMs, () =>
        this.aiClient!.models.generateContent({
          model: imageModel,
          contents: imagePrompt,
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        }),
      );
      const parts = (response as any)?.candidates?.[0]?.content?.parts || [];
      const inline = parts.find((part: any) => part?.inlineData?.data || part?.inline_data?.data);
      const data = inline?.inlineData?.data || inline?.inline_data?.data;
      const mimeType = inline?.inlineData?.mimeType || inline?.inline_data?.mime_type || 'image/png';
      return decodeImageBytes(data, mimeType);
    };

    const mapAndThrow = (error: any, usedModel: string): never => {
      model = usedModel;
      if (error instanceof BadRequestException && this.categorizeError(error) === 'INVALID_INPUT') {
        this.logImageEvent({
          model,
          stage,
          statusCode: 400,
          errorCode: 'AI_IMAGE_INVALID_REQUEST',
          durationMs: Date.now() - startTime,
        });
        throw error;
      }

      const category = this.categorizeError(error);
      const upstreamStatus = Number(error?.status || error?.statusCode) || 0;

      if (category === 'TIMEOUT' || error instanceof RequestTimeoutException) {
        this.logImageEvent({
          model,
          stage: 'provider_api',
          statusCode: 408,
          errorCode: 'AI_IMAGE_TIMEOUT',
          durationMs: Date.now() - startTime,
        });
        throw new RequestTimeoutException({
          statusCode: 408,
          code: 'AI_IMAGE_TIMEOUT',
          message: `Yêu cầu AI (image) vượt quá thời gian cho phép (${Math.round(timeoutMs / 1000)} giây)`,
        });
      }

      if (
        category === 'MODEL_NOT_FOUND' ||
        category === 'AUTH_ERROR' ||
        category === 'QUOTA_EXCEEDED' ||
        category === 'SERVICE_UNAVAILABLE' ||
        category === 'PARSE_ERROR'
      ) {
        this.logImageEvent({
          model,
          stage,
          statusCode: 503,
          errorCode: 'AI_IMAGE_PROVIDER_UNAVAILABLE',
          durationMs: Date.now() - startTime,
        });
        throw new ServiceUnavailableException({
          statusCode: 503,
          code: 'AI_IMAGE_PROVIDER_UNAVAILABLE',
          message: 'Dịch vụ tạo ảnh AI hiện chưa khả dụng.',
        });
      }

      if (category === 'INVALID_INPUT' || (upstreamStatus >= 400 && upstreamStatus < 500)) {
        this.logImageEvent({
          model,
          stage: 'provider_api',
          statusCode: 400,
          errorCode: 'AI_IMAGE_INVALID_REQUEST',
          durationMs: Date.now() - startTime,
        });
        throw new BadRequestException({
          statusCode: 400,
          code: 'AI_IMAGE_INVALID_REQUEST',
          message: 'Yêu cầu tạo ảnh không hợp lệ. Vui lòng điều chỉnh mô tả và thử lại.',
        });
      }

      this.logImageEvent({
        model,
        stage: 'provider_api',
        statusCode: 503,
        errorCode: 'AI_IMAGE_UPSTREAM_ERROR',
        durationMs: Date.now() - startTime,
      });
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'AI_IMAGE_UPSTREAM_ERROR',
        message: 'Dịch vụ tạo ảnh AI hiện chưa khả dụng.',
      });
    };

    const runPrimary = () =>
      this.isImagenModel(model) ? generateViaImagen(model) : generateViaContent(model);

    try {
      const result = await runPrimary();
      this.logImageEvent({
        model,
        stage: 'provider_api',
        statusCode: 200,
        errorCode: 'SUCCESS',
        durationMs: Date.now() - startTime,
      });
      return result;
    } catch (error: any) {
      if (error instanceof RequestTimeoutException || this.categorizeError(error) === 'TIMEOUT') {
        return mapAndThrow(error, model);
      }

      const category = this.categorizeError(error);
      const fallbackModel = this.getImageFallbackModelName();
      const shouldFallback =
        fallbackModel &&
        fallbackModel !== model &&
        (this.isImagenModel(model) ||
          category === 'MODEL_NOT_FOUND' ||
          category === 'PARSE_ERROR');

      if (shouldFallback) {
        this.logger.warn(
          `[AI] feature=image-generate provider=gemini model=${model} stage=provider_api statusCode=0 errorCode=FALLBACK durationMs=${Date.now() - startTime}`,
        );
        try {
          model = fallbackModel;
          const result = await generateViaContent(fallbackModel);
          this.logImageEvent({
            model: fallbackModel,
            stage: 'provider_api',
            statusCode: 200,
            errorCode: 'SUCCESS',
            durationMs: Date.now() - startTime,
          });
          return result;
        } catch (fallbackError: any) {
          return mapAndThrow(fallbackError, fallbackModel);
        }
      }

      return mapAndThrow(error, model);
    }
  }
}
