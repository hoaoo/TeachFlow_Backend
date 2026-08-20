import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  RequestTimeoutException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Schema } from '@google/genai';
import { PrismaService } from '../prisma/prisma.service';

import { GenerateLessonPlanDto } from './dto/generate-lesson-plan.dto';
import { GenerateActivityDto } from './dto/generate-activity.dto';
import { GenerateWorksheetDto } from './dto/generate-worksheet.dto';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import { GenerateStudentCommentDto } from './dto/generate-student-comment.dto';

import { lessonPlanSchema } from './schemas/lesson-plan.schema';
import { activitySchema } from './schemas/activity.schema';
import { worksheetSchema } from './schemas/worksheet.schema';
import { questionsSchema } from './schemas/questions.schema';
import { studentCommentSchema } from './schemas/student-comment.schema';

import { SYSTEM_INSTRUCTION } from './prompts/system.prompt';
import { buildLessonPlanPrompt } from './prompts/lesson-plan.prompt';
import { buildActivityPrompt } from './prompts/activity.prompt';
import { buildWorksheetPrompt } from './prompts/worksheet.prompt';
import { buildQuestionsPrompt } from './prompts/questions.prompt';
import { buildStudentCommentPrompt, AnonymizedStudentProfile } from './prompts/student-comment.prompt';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private aiClient: GoogleGenAI | null = null;
  private readonly DEFAULT_BASE_TIMEOUT_MS = 60000; // 60 seconds default base timeout
  private readonly DEFAULT_LIGHT_TIMEOUT_MS = 30000; // 30 seconds default for light tasks
  private readonly PRIMARY_MODEL = 'gemini-3.6-flash';
  private readonly FALLBACK_MODEL = 'gemini-2.5-flash';

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.initClient();
  }

  private initClient() {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
    if (apiKey && apiKey.trim() !== '') {
      this.aiClient = new GoogleGenAI({ apiKey: apiKey.trim() });
      this.logger.log('Google Gen AI SDK initialized successfully');
    } else {
      this.logger.warn('GEMINI_API_KEY is not set. Real AI generation will require setting this environment variable.');
    }
  }

  /**
   * Get base timeout in ms from GEMINI_TIMEOUT_MS env or default 60000ms
   */
  private getBaseTimeoutMs(): number {
    const configured = this.configService.get<string>('GEMINI_TIMEOUT_MS') || process.env.GEMINI_TIMEOUT_MS;
    if (configured) {
      const parsed = parseInt(configured, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return this.DEFAULT_BASE_TIMEOUT_MS;
  }

  /**
   * Determine per-operation timeout:
   * - Heavy operations (lesson-plan, worksheet): allow full base timeout (up to 60s / configured)
   * - Light operations (activity, questions, student-comment): 30s (or min with baseTimeout)
   */
  private getTimeoutForOperation(operation: string): number {
    const baseTimeout = this.getBaseTimeoutMs();
    if (operation === 'lesson-plan' || operation === 'worksheet') {
      return baseTimeout;
    }
    return Math.min(this.DEFAULT_LIGHT_TIMEOUT_MS, baseTimeout);
  }

  /**
   * Resolve model name following strict precedence:
   * 1. GEMINI_MODEL env var if configured
   * 2. Default: gemini-3.6-flash (fallback gemini-2.5-flash)
   * Note: NEVER use gemini-1.5-flash.
   */
  private getModelName(): string {
    const configuredModel = this.configService.get<string>('GEMINI_MODEL') || process.env.GEMINI_MODEL;
    if (configuredModel && configuredModel.trim() !== '') {
      return configuredModel.trim();
    }
    return this.PRIMARY_MODEL;
  }

  /**
   * Categorize error without leaking sensitive data
   */
  private categorizeError(error: any): string {
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
    if (status === 404 || msg.includes('not found') || msg.includes('not supported')) {
      return 'MODEL_NOT_FOUND';
    }
    if (msg.includes('malformed json') || msg.includes('json.parse') || msg.includes('empty response')) {
      return 'PARSE_ERROR';
    }
    if (status === 401 || status === 403 || msg.includes('api_key_invalid') || msg.includes('permission_denied')) {
      return 'AUTH_ERROR';
    }
    if (status === 503 || msg.includes('service unavailable')) {
      return 'SERVICE_UNAVAILABLE';
    }
    return 'UPSTREAM_ERROR';
  }

  /**
   * Helper to execute Gemini generation with per-operation timeout, structured schema, retry and fallback.
   * Logs ONLY: operation, model, elapsedMs, status/errorCategory.
   */
  private async executeGenerate<T>(
    operation: string,
    prompt: string,
    schema: Schema,
    retryCount = 1,
  ): Promise<T> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
    if (!this.aiClient || !apiKey) {
      this.logger.warn(`[AI] operation=${operation} model=none elapsedMs=0 status=UNAVAILABLE errorCategory=UNCONFIGURED_API_KEY`);
      throw new ServiceUnavailableException(
        'Hệ thống AI chưa được cấu hình GEMINI_API_KEY ở backend. Vui lòng cấu hình khóa API trong file .env',
      );
    }

    const modelToUse = this.getModelName();
    const timeoutMs = this.getTimeoutForOperation(operation);
    const startTime = Date.now();

    const runCall = async (model: string): Promise<T> => {
      let timeoutHandle: NodeJS.Timeout | null = null;

      const generatePromise = this.aiClient!.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.7,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new RequestTimeoutException(`Yêu cầu AI (${operation}) vượt quá thời gian cho phép (${Math.round(timeoutMs / 1000)} giây)`));
        }, timeoutMs);
      });

      try {
        const response = await Promise.race([generatePromise, timeoutPromise]);
        if (timeoutHandle) clearTimeout(timeoutHandle);

        const rawText = response.text?.trim();
        if (!rawText) {
          throw new Error('Gemini returned an empty response');
        }

        try {
          const parsed = JSON.parse(rawText) as T;
          return parsed;
        } catch (parseError) {
          throw new Error('Malformed JSON received from model');
        }
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    };

    try {
      const result = await runCall(modelToUse);
      const elapsedMs = Date.now() - startTime;
      this.logger.log(`[AI] operation=${operation} model=${modelToUse} elapsedMs=${elapsedMs} status=SUCCESS`);
      return result;
    } catch (error: any) {
      const elapsedMs = Date.now() - startTime;
      const errorCategory = this.categorizeError(error);

      this.logger.error(`[AI] operation=${operation} model=${modelToUse} elapsedMs=${elapsedMs} status=FAILED errorCategory=${errorCategory}`);

      // If primary model failed due to model not found / unsupported, fallback to gemini-2.5-flash
      if (modelToUse === this.PRIMARY_MODEL && errorCategory === 'MODEL_NOT_FOUND') {
        this.logger.warn(`[AI] operation=${operation} model=${this.PRIMARY_MODEL} falling back to ${this.FALLBACK_MODEL}`);
        try {
          const fallbackResult = await runCall(this.FALLBACK_MODEL);
          const fallbackElapsedMs = Date.now() - startTime;
          this.logger.log(`[AI] operation=${operation} model=${this.FALLBACK_MODEL} elapsedMs=${fallbackElapsedMs} status=SUCCESS`);
          return fallbackResult;
        } catch (fallbackError: any) {
          const fallbackCategory = this.categorizeError(fallbackError);
          this.logger.error(`[AI] operation=${operation} model=${this.FALLBACK_MODEL} elapsedMs=${Date.now() - startTime} status=FAILED errorCategory=${fallbackCategory}`);
        }
      }

      // DO NOT retry on timeout (to prevent duplicated slow requests)
      if (errorCategory === 'TIMEOUT' || error instanceof RequestTimeoutException) {
        throw error;
      }

      // Safe retry for transient upstream or parse errors ONLY (never on timeout, auth, quota, or model not found)
      if (
        retryCount > 0 &&
        errorCategory !== 'AUTH_ERROR' &&
        errorCategory !== 'QUOTA_EXCEEDED' &&
        errorCategory !== 'MODEL_NOT_FOUND'
      ) {
        this.logger.warn(`[AI] operation=${operation} retrying generation (${retryCount} attempt left)...`);
        return this.executeGenerate<T>(operation, prompt, schema, retryCount - 1);
      }

      throw new InternalServerErrorException('Không thể tạo nội dung lúc này. Vui lòng thử lại.');
    }
  }

  // 1. Generate Lesson Plan (Heavy - up to 60s)
  async generateLessonPlan(dto: GenerateLessonPlanDto) {
    const prompt = buildLessonPlanPrompt(dto);
    const result = await this.executeGenerate<any>('lesson-plan', prompt, lessonPlanSchema);
    return result;
  }

  // 2. Generate Activity (Light - 30s)
  async generateActivity(dto: GenerateActivityDto) {
    const prompt = buildActivityPrompt(dto);
    const result = await this.executeGenerate<any>('activity', prompt, activitySchema);
    return result;
  }

  // 3. Generate Worksheet (Heavy - up to 60s)
  async generateWorksheet(dto: GenerateWorksheetDto) {
    const prompt = buildWorksheetPrompt(dto);
    const result = await this.executeGenerate<any>('worksheet', prompt, worksheetSchema);
    return result;
  }

  // 4. Generate Questions (Light - 30s)
  async generateQuestions(dto: GenerateQuestionsDto) {
    const prompt = buildQuestionsPrompt(dto);
    const result = await this.executeGenerate<any>('questions', prompt, questionsSchema);
    return result;
  }

  // 5. Generate Student Comment (Light - 30s, Zero PII)
  async generateStudentComment(dto: GenerateStudentCommentDto) {
    const profile: AnonymizedStudentProfile = {
      subject: dto.subject || 'Tổng hợp',
      criteria: dto.criteria || {},
      assessmentLevel: dto.assessmentLevel || 'Đạt',
      notes: dto.notes,
    };

    // If studentId provided, fetch additional criteria from assessments without fetching or sending student PII
    if (dto.studentId) {
      try {
        const assessments = await this.prisma.studentAssessment.findMany({
          where: { studentId: dto.studentId },
          include: {
            assessment: {
              include: { subject: true },
            },
          },
          take: 5,
        });

        if (assessments.length > 0) {
          const fetchedCriteria: Record<string, string> = { ...profile.criteria };
          for (const sa of assessments) {
            const subjectName = sa.assessment?.subject?.name || 'Môn học';
            const levelLabel =
              sa.level === 'EXCELLENT'
                ? 'Hoàn thành tốt'
                : sa.level === 'COMPLETED'
                  ? 'Hoàn thành'
                  : 'Cần hỗ trợ';
            fetchedCriteria[subjectName] = levelLabel;
          }
          profile.criteria = fetchedCriteria;
        }
      } catch (err) {
        this.logger.warn(`Could not load assessment details for student ${dto.studentId}`);
      }
    }

    const prompt = buildStudentCommentPrompt(profile);
    const result = await this.executeGenerate<any>('student-comment', prompt, studentCommentSchema);
    return result;
  }
}
