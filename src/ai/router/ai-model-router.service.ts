import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AiTaskCategory = 'gemma' | 'extraction' | 'complex' | 'image';

export interface ModelRoute {
  taskCategory: AiTaskCategory;
  primaryModel: string;
  fallbackChain: string[];
}

@Injectable()
export class AiModelRouterService {
  public static readonly DEFAULT_GEMMA_MODEL = 'gemma-4-26b-a4b-it';
  public static readonly DEFAULT_FAST_MODEL = 'gemini-3.5-flash-lite';
  public static readonly DEFAULT_COMPLEX_MODEL = 'gemini-3.7-flash';
  public static readonly DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';
  public static readonly DEFAULT_IMAGE_FALLBACK_MODEL = 'gemini-3.1-flash-lite-image';

  constructor(private readonly configService: ConfigService) {}

  getGemmaModel(): string {
    return (
      this.configService?.get<string>('GEMMA_MODEL') ||
      process.env.GEMMA_MODEL ||
      AiModelRouterService.DEFAULT_GEMMA_MODEL
    );
  }

  getFastModel(): string {
    return (
      this.configService?.get<string>('GEMINI_FAST_MODEL') ||
      process.env.GEMINI_FAST_MODEL ||
      AiModelRouterService.DEFAULT_FAST_MODEL
    );
  }

  getComplexModel(): string {
    return (
      this.configService?.get<string>('GEMINI_COMPLEX_MODEL') ||
      process.env.GEMINI_COMPLEX_MODEL ||
      this.configService?.get<string>('GEMINI_MODEL') ||
      process.env.GEMINI_MODEL ||
      AiModelRouterService.DEFAULT_COMPLEX_MODEL
    );
  }

  getImageModel(): string {
    return (
      this.configService?.get<string>('GEMINI_IMAGE_MODEL') ||
      process.env.GEMINI_IMAGE_MODEL ||
      AiModelRouterService.DEFAULT_IMAGE_MODEL
    );
  }

  getImageFallbackModel(): string {
    return (
      this.configService?.get<string>('GEMINI_IMAGE_FALLBACK_MODEL') ||
      process.env.GEMINI_IMAGE_FALLBACK_MODEL ||
      AiModelRouterService.DEFAULT_IMAGE_FALLBACK_MODEL
    );
  }

  getRouteForOperation(operation: string): ModelRoute {
    const op = (operation || '').toLowerCase().trim();
    const gemma = this.getGemmaModel();
    const fast = this.getFastModel();
    const complex = this.getComplexModel();

    // 1. Complex tasks -> Gemini 3.7 Flash
    // lesson-plan, worksheet, homeroom-weekly-summary, homeroom-monthly-summary, homeroom-summary, complex-analysis, complex-reasoning
    if (
      op === 'lesson-plan' ||
      op === 'worksheet' ||
      op === 'homeroom-weekly-summary' ||
      op === 'homeroom-monthly-summary' ||
      op === 'homeroom-summary' ||
      op === 'complex-analysis' ||
      op === 'complex-reasoning'
    ) {
      return {
        taskCategory: 'complex',
        primaryModel: complex,
        // Chain: Gemini 3.7 -> Gemini 3.5 Flash Lite -> Gemma 4 26B
        fallbackChain: Array.from(new Set([fast, gemma])).filter((m) => m !== complex),
      };
    }

    // 2. Extraction / High-throughput tasks -> Gemini 3.5 Flash Lite
    // document-extraction, pdf-extraction, docx-extraction, xlsx-extraction, structured-extraction, batch-processing, import
    if (
      op === 'document-extraction' ||
      op === 'pdf-extraction' ||
      op === 'docx-extraction' ||
      op === 'xlsx-extraction' ||
      op === 'structured-extraction' ||
      op === 'batch-processing' ||
      op === 'import' ||
      op === 'import-students' ||
      op === 'import-lesson-plan' ||
      op === 'import-worksheet'
    ) {
      return {
        taskCategory: 'extraction',
        primaryModel: fast,
        // Chain: Gemini 3.5 Flash Lite -> Gemma 4 26B
        fallbackChain: Array.from(new Set([gemma])).filter((m) => m !== fast),
      };
    }

    // 3. Image generation tasks -> Gemini 3.1 Flash Image
    if (op === 'image' || op === 'image-generate') {
      const imgPrimary = this.getImageModel();
      const imgFallback = this.getImageFallbackModel();
      return {
        taskCategory: 'image',
        primaryModel: imgPrimary,
        fallbackChain: imgFallback !== imgPrimary ? [imgFallback] : [],
      };
    }

    // 4. Default / Frequent tasks -> Gemma 4 26B
    // chat, student-comment, questions, summarize, quick-action, activity, simple-image-analysis, simple-pdf-analysis
    return {
      taskCategory: 'gemma',
      primaryModel: gemma,
      // Chain: Gemma 4 26B -> Gemini 3.5 Flash Lite
      fallbackChain: Array.from(new Set([fast])).filter((m) => m !== gemma),
    };
  }
}
