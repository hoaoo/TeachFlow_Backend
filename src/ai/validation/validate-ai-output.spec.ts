import { validateAiOutput } from './validate-ai-output';
import { GeneratedLessonPlanOutputDto, GeneratedWorksheetOutputDto } from '../dto/generated-outputs.dto';

describe('validateAiOutput', () => {
  it('accepts a valid structured lesson plan', () => {
    const result = validateAiOutput(GeneratedLessonPlanOutputDto, {
      title: 'Phân số bằng nhau',
      objectives: 'Nhận biết phân số bằng nhau',
      teachingEquipment: 'SGK, phiếu học tập',
      activities: [
        {
          activityType: 'WARM_UP',
          title: 'Khởi động',
          objective: 'Tạo hứng thú',
          durationMinutes: 5,
          methods: ['Trò chơi'],
          teacherActivity: 'GV tổ chức trò chơi',
          studentActivity: 'HS tham gia',
        },
      ],
    });
    expect(result.title).toBe('Phân số bằng nhau');
    expect(result.activities).toHaveLength(1);
  });

  it('rejects malformed lesson plan payloads', () => {
    expect(() => validateAiOutput(GeneratedLessonPlanOutputDto, { title: 'Thiếu hoạt động' })).toThrow(
      /Malformed JSON/,
    );
  });

  it('rejects null/empty AI output', () => {
    expect(() => validateAiOutput(GeneratedLessonPlanOutputDto, null)).toThrow(/Malformed JSON/);
    expect(() => validateAiOutput(GeneratedLessonPlanOutputDto, 'raw text')).toThrow(/Malformed JSON/);
  });

  it('normalizes worksheet question types', () => {
    const result = validateAiOutput(GeneratedWorksheetOutputDto, {
      title: 'Phiếu phân số',
      questions: [
        {
          questionType: 'Trắc nghiệm',
          content: 'Phân số nào bằng 1/2?',
          options: ['2/4', '2/3'],
          correctAnswer: '2/4',
        },
      ],
    });
    expect(result.questions[0].questionType).toBe('MULTIPLE_CHOICE');
  });
});
