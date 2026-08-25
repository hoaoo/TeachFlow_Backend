import { Injectable } from '@nestjs/common';
import { GeminiProvider } from './providers/gemini.provider';
import { GenerateWorksheetDto } from './dto/generate-worksheet.dto';
import { GeneratedWorksheetOutputDto, normalizeQuestionType } from './dto/generated-outputs.dto';
import { validateAiOutput } from './validation/validate-ai-output';
import { worksheetSchema } from './schemas/worksheet.schema';
import { buildWorksheetPrompt } from './prompts/worksheet.prompt';

@Injectable()
export class WorksheetAiService {
  constructor(private readonly provider: GeminiProvider) {}

  async generate(dto: GenerateWorksheetDto): Promise<GeneratedWorksheetOutputDto> {
    const prompt = buildWorksheetPrompt(dto);
    const result = await this.provider.generateStructured<GeneratedWorksheetOutputDto>({
      operation: 'worksheet',
      prompt,
      schema: worksheetSchema,
      validate: (raw) => validateAiOutput(GeneratedWorksheetOutputDto, raw),
    });

    return {
      ...result,
      questions: (result.questions || []).map((question) => {
        const questionType = normalizeQuestionType(question.questionType);
        return {
          ...question,
          questionType,
          options: questionType === 'ESSAY' ? question.options || [] : question.options || [],
          correctAnswer: dto.includeAnswers === false ? undefined : question.correctAnswer || question.answer,
          explanation: dto.includeAnswers === false ? undefined : question.explanation,
        };
      }),
    };
  }

  toEditorDraft(result: GeneratedWorksheetOutputDto, dto: GenerateWorksheetDto) {
    return {
      title: result.title || `Phiếu học tập: ${dto.lesson}`,
      description: result.description || `Phiếu bài tập ${dto.subject} Lớp ${dto.grade}`,
      subtitle: `${dto.subject} · Lớp ${dto.grade}`,
      status: 'Bản nháp',
      questions: (result.questions || []).map((question, index) => ({
        questionType: normalizeQuestionType(question.questionType),
        content: question.content,
        options: question.options || [],
        correctAnswer: question.correctAnswer || question.answer || '',
        explanation: question.explanation || '',
        sortOrder: index,
      })),
    };
  }
}
