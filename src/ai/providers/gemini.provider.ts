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
    return this.getEnvString('GEMINI_MODEL') || this.getEnvString('GEMINI_PRIMARY_MODEL') || 'gemini-3.7-flash';
  }

  getFallbackModelName(): string {
    return this.getEnvString('GEMINI_FALLBACK_MODEL') || 'gemini-3.6-flash';
  }

  getImageModelName(): string {
    return this.getEnvString('GEMINI_IMAGE_MODEL') || 'gemini-3.1-flash-image';
  }

  getImageFallbackModelName(): string {
    return this.getEnvString('GEMINI_IMAGE_FALLBACK_MODEL') || 'gemini-3.1-flash-lite-image';
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

  categorizeError(error: any): { category: string; status: number; code: string; message: string } {
    if (
      error instanceof RequestTimeoutException ||
      error?.name === 'RequestTimeoutException' ||
      error?.message?.includes('vượt quá thời gian') ||
      error?.message?.includes('timed out') ||
      error?.message?.includes('timeout')
    ) {
      return {
        category: 'TIMEOUT',
        status: 408,
        code: 'AI_TIMEOUT',
        message: 'Yêu cầu AI vượt quá thời gian cho phép. Vui lòng thử lại.',
      };
    }

    const msg = String(error?.message || '').toLowerCase();
    const status = Number(error?.status || error?.statusCode) || 0;

    if (
      status === 429 ||
      msg.includes('429') ||
      msg.includes('quota') ||
      msg.includes('resource_exhausted') ||
      msg.includes('rate_limit') ||
      msg.includes('rate limit')
    ) {
      return {
        category: 'QUOTA_EXCEEDED',
        status: 429,
        code: 'AI_RATE_LIMITED',
        message: 'Hệ thống AI Gemini đã vượt quá giới hạn yêu cầu (Rate limit / Quota). Vui lòng thử lại sau.',
      };
    }

    if (
      status === 503 ||
      msg.includes('503') ||
      msg.includes('unavailable') ||
      msg.includes('high demand') ||
      msg.includes('service unavailable') ||
      msg.includes('capacity') ||
      msg.includes('overloaded')
    ) {
      return {
        category: 'SERVICE_UNAVAILABLE',
        status: 503,
        code: 'AI_PROVIDER_UNAVAILABLE',
        message: 'Dịch vụ AI đang tạm quá tải. Vui lòng thử lại sau.',
      };
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
      return {
        category: 'MODEL_NOT_FOUND',
        status: 404,
        code: 'AI_MODEL_NOT_FOUND',
        message: 'Mô hình AI hiện không khả dụng. Vui lòng thử lại sau.',
      };
    }

    if (
      msg.includes('malformed json') ||
      msg.includes('json.parse') ||
      msg.includes('empty response') ||
      msg.includes('không đúng định dạng')
    ) {
      return {
        category: 'PARSE_ERROR',
        status: 503,
        code: 'AI_PARSE_ERROR',
        message: 'AI trả về dữ liệu không đúng định dạng. Vui lòng thử lại.',
      };
    }

    if (status === 400 || msg.includes('invalid argument') || msg.includes('prompt is too')) {
      return {
        category: 'INVALID_INPUT',
        status: 400,
        code: 'AI_INVALID_REQUEST',
        message: 'Yêu cầu không hợp lệ. Vui lòng kiểm tra lại nội dung.',
      };
    }

    if (
      status === 401 ||
      status === 403 ||
      msg.includes('api_key_invalid') ||
      msg.includes('permission_denied') ||
      msg.includes('unauthorized') ||
      msg.includes('forbidden')
    ) {
      return {
        category: 'AUTH_ERROR',
        status: 503,
        code: 'AI_AUTH_ERROR',
        message: 'Khóa API Gemini chưa hợp lệ hoặc chưa được cấp quyền.',
      };
    }

    return {
      category: 'UPSTREAM_ERROR',
      status: status || 503,
      code: 'AI_UPSTREAM_ERROR',
      message: 'Không thể tạo nội dung lúc này. Vui lòng thử lại.',
    };
  }

  private async sleepWithBackoff(attempt: number, baseMs: number = 1000): Promise<void> {
    const backoff = baseMs * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * 300);
    await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
  }

  private async executeWithModelRetry<T>(
    operation: string,
    model: string,
    work: () => Promise<T>,
    maxRetries: number = 2,
  ): Promise<T> {
    let lastError: any;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const startTime = Date.now();
      try {
        const result = await work();
        const durationMs = Date.now() - startTime;
        this.logger.log(
          `[AI] model=${model} attempt=${attempt} upstreamStatus=200 upstreamCode=SUCCESS durationMs=${durationMs}`,
        );
        return result;
      } catch (err: any) {
        lastError = err;
        const durationMs = Date.now() - startTime;
        const info = this.categorizeError(err);
        this.logger.warn(
          `[AI] model=${model} attempt=${attempt} upstreamStatus=${info.status} upstreamCode=${info.code} durationMs=${durationMs}`,
        );

        // Never retry on 429, 400, 404, 401/403, or TIMEOUT
        if (
          info.category === 'QUOTA_EXCEEDED' ||
          info.category === 'INVALID_INPUT' ||
          info.category === 'MODEL_NOT_FOUND' ||
          info.category === 'AUTH_ERROR' ||
          info.category === 'TIMEOUT' ||
          err instanceof RequestTimeoutException
        ) {
          throw err;
        }

        // Retry 503 or transient upstream error up to maxRetries
        if (attempt <= maxRetries) {
          this.logger.log(
            `[AI] model=${model} 503 backoff retry (${attempt}/${maxRetries})...`,
          );
          await this.sleepWithBackoff(attempt - 1, 1000);
        }
      }
    }
    throw lastError;
  }

  private assertClientReady(operation: string) {
    if (!this.aiClient || !this.getApiKey()) {
      this.logger.warn(
        `[AI] operation=${operation} model=none elapsedMs=0 status=UNAVAILABLE errorCategory=UNCONFIGURED_API_KEY`,
      );
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'AI_AUTH_ERROR',
        message: 'Hệ thống AI chưa được cấu hình GEMINI_API_KEY ở backend. Vui lòng cấu hình khóa API trong file .env',
      });
    }
  }

  private assertPromptSize(prompt: string) {
    const maxChars = this.getMaxInputChars();
    if (prompt && prompt.length > maxChars) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'AI_INVALID_REQUEST',
        message: `Nội dung gửi tới AI vượt quá giới hạn cho phép (${maxChars} ký tự). Vui lòng rút gọn yêu cầu hoặc tệp nguồn.`,
      });
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
          new RequestTimeoutException({
            statusCode: 408,
            code: 'AI_TIMEOUT',
            message: `Yêu cầu AI (${operation}) vượt quá thời gian cho phép (${Math.round(timeoutMs / 1000)} giây)`,
          }),
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
    this.assertClientReady(operation);
    this.assertPromptSize(prompt);

    const primaryModel = this.getModelName();
    const fallbackModel = this.getFallbackModelName();
    const timeoutMs = options.timeoutMs ?? this.getTimeoutForOperation(operation);

    const callModel = (model: string) => async (): Promise<T> => {
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

    let lastError: any;
    try {
      return await this.executeWithModelRetry(operation, primaryModel, callModel(primaryModel), 2);
    } catch (primaryErr: any) {
      lastError = primaryErr;
      const info = this.categorizeError(primaryErr);

      if (
        info.category === 'INVALID_INPUT' ||
        info.category === 'AUTH_ERROR' ||
        info.category === 'QUOTA_EXCEEDED'
      ) {
        return this.mapAndThrowError(primaryErr, operation, primaryModel);
      }

      if (fallbackModel && fallbackModel !== primaryModel) {
        this.logger.warn(
          `[AI] operation=${operation} primary model=${primaryModel} failed. Falling back to model=${fallbackModel}`,
        );
        try {
          return await this.executeWithModelRetry(operation, fallbackModel, callModel(fallbackModel), 2);
        } catch (fallbackErr: any) {
          lastError = fallbackErr;
        }
      }
    }

    return this.mapAndThrowError(lastError, operation, primaryModel);
  }

  async generateText(options: GenerateTextOptions): Promise<string> {
    const { operation, prompt, inlineParts } = options;
    this.assertClientReady(operation);
    this.assertPromptSize(prompt);

    const primaryModel = this.getModelName();
    const fallbackModel = this.getFallbackModelName();
    const timeoutMs = options.timeoutMs ?? this.getTimeoutForOperation(operation);

    const callModel = (model: string) => async (): Promise<string> => {
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

    let lastError: any;
    try {
      return await this.executeWithModelRetry(operation, primaryModel, callModel(primaryModel), 2);
    } catch (primaryErr: any) {
      lastError = primaryErr;
      const info = this.categorizeError(primaryErr);

      if (
        info.category === 'INVALID_INPUT' ||
        info.category === 'AUTH_ERROR' ||
        info.category === 'QUOTA_EXCEEDED'
      ) {
        return this.mapAndThrowError(primaryErr, operation, primaryModel);
      }

      if (fallbackModel && fallbackModel !== primaryModel) {
        this.logger.warn(
          `[AI] operation=${operation} primary model=${primaryModel} failed. Falling back to model=${fallbackModel}`,
        );
        try {
          return await this.executeWithModelRetry(operation, fallbackModel, callModel(fallbackModel), 2);
        } catch (fallbackErr: any) {
          lastError = fallbackErr;
        }
      }
    }

    return this.mapAndThrowError(lastError, operation, primaryModel);
  }

  private mapAndThrowError(error: any, operation: string, model: string): never {
    const info = this.categorizeError(error);

    if (info.category === 'TIMEOUT' || error instanceof RequestTimeoutException) {
      throw new RequestTimeoutException({
        statusCode: 408,
        code: 'AI_TIMEOUT',
        message: `Yêu cầu AI (${operation}) vượt quá thời gian cho phép. Vui lòng thử lại.`,
      });
    }

    if (info.category === 'INVALID_INPUT' || error instanceof BadRequestException) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'AI_INVALID_REQUEST',
        message: 'Yêu cầu không hợp lệ. Vui lòng kiểm tra lại nội dung.',
      });
    }

    if (info.category === 'QUOTA_EXCEEDED') {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'AI_RATE_LIMITED',
        message: 'Hệ thống AI Gemini đã vượt quá giới hạn yêu cầu (Rate limit / Quota). Vui lòng thử lại sau.',
      });
    }

    if (info.category === 'AUTH_ERROR') {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'AI_AUTH_ERROR',
        message: 'Khóa API Gemini chưa hợp lệ hoặc chưa được cấp quyền.',
      });
    }

    if (info.category === 'MODEL_NOT_FOUND') {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'AI_MODEL_NOT_FOUND',
        message: `Mô hình AI (${model}) hiện không khả dụng. Vui lòng thử lại sau.`,
      });
    }

    // Default 503 for temporary overload / service unavailable
    throw new ServiceUnavailableException({
      statusCode: 503,
      code: 'AI_PROVIDER_UNAVAILABLE',
      message: 'Dịch vụ AI đang tạm quá tải. Vui lòng thử lại sau.',
    });
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
      const { category, status: upstreamStatus } = this.categorizeError(error);

      if (error instanceof BadRequestException && category === 'INVALID_INPUT') {
        this.logImageEvent({
          model,
          stage,
          statusCode: 400,
          errorCode: 'AI_IMAGE_INVALID_REQUEST',
          durationMs: Date.now() - startTime,
        });
        throw error;
      }

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
      const { category } = this.categorizeError(error);
      if (error instanceof RequestTimeoutException || category === 'TIMEOUT') {
        return mapAndThrow(error, model);
      }

      const fallbackModel = this.getImageFallbackModelName();
      const shouldFallback =
        fallbackModel &&
        fallbackModel !== model &&
        category !== 'INVALID_INPUT';

      if (shouldFallback) {
        this.logger.warn(
          `[AI] feature=image-generate provider=gemini model=${model} stage=provider_api statusCode=0 errorCode=FALLBACK durationMs=${Date.now() - startTime}`,
        );
        try {
          model = fallbackModel;
          const result = await (this.isImagenModel(fallbackModel)
            ? generateViaImagen(fallbackModel)
            : generateViaContent(fallbackModel));
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
