import { Injectable } from '@nestjs/common';
import { GeminiProvider } from './providers/gemini.provider';
import { GenerateLessonPlanDto } from './dto/generate-lesson-plan.dto';
import { GeneratedLessonPlanOutputDto, normalizeActivityType } from './dto/generated-outputs.dto';
import { validateAiOutput } from './validation/validate-ai-output';
import { lessonPlanSchema } from './schemas/lesson-plan.schema';
import { buildLessonPlanPrompt } from './prompts/lesson-plan.prompt';

export const ACTIVITY_PHASE_LABEL: Record<string, string> = {
  WARM_UP: 'Khởi động',
  EXPLORE: 'Khám phá',
  PRACTICE: 'Luyện tập',
  APPLICATION: 'Vận dụng',
  OTHER: 'Hoạt động khác',
};

@Injectable()
export class LessonPlanAiService {
  constructor(private readonly provider: GeminiProvider) {}

  async generate(dto: GenerateLessonPlanDto): Promise<GeneratedLessonPlanOutputDto> {
    const prompt = buildLessonPlanPrompt(dto);
    return this.provider.generateStructured<GeneratedLessonPlanOutputDto>({
      operation: 'lesson-plan',
      prompt,
      schema: lessonPlanSchema,
      validate: (raw) => validateAiOutput(GeneratedLessonPlanOutputDto, raw),
    });
  }

  toEditorDraft(result: GeneratedLessonPlanOutputDto, dto: GenerateLessonPlanDto) {
    return {
      title: result.title || dto.lessonTitle,
      topic: dto.lessonTitle,
      subject: dto.subject,
      grade: `Lớp ${dto.grade}`,
      duration: dto.durationMinutes || 40,
      objective: result.objectives || dto.objectives || '',
      specificCompetencies: result.specificCompetencies || dto.competencies || '',
      generalCompetencies: result.generalCompetencies || '',
      qualities: result.qualities || dto.qualities || '',
      teachingEquipment: result.teachingEquipment || '',
      status: 'DRAFT',
      activities: (result.activities || []).map((activity, index) => {
        const type = normalizeActivityType(activity.activityType || ACTIVITY_PHASE_LABEL[index] || 'OTHER');
        return {
          phase: ACTIVITY_PHASE_LABEL[type] || 'Hoạt động',
          title: activity.title,
          minutes: activity.durationMinutes || 5,
          method: (activity.methods || []).join(', '),
          technique: (activity.techniques || []).join(', '),
          competencies: (activity.competencies || []).join(', '),
          qualities: (activity.qualities || []).join(', '),
          equipment: '',
          objective: activity.objective || '',
          teacher: activity.teacherActivity || '',
          students: activity.studentActivity || '',
          sortOrder: index,
        };
      }),
    };
  }
}
