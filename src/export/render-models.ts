export interface LessonPlanRenderActivity {
  id?: string;
  phase: string;
  title: string;
  durationMinutes: number;
  method?: string | null;
  technique?: string | null;
  competencies?: string | null;
  qualities?: string | null;
  objective?: string | null;
  teacherActivity?: string | null;
  studentActivity?: string | null;
  equipment?: string | null;
  sortOrder: number;
}

export interface LessonPlanRenderModel {
  id?: string;
  title: string;
  topic?: string | null;
  subjectName?: string | null;
  gradeName?: string | null;
  weekNumber?: number | null;
  periodNumber?: number | null;
  teachingDate?: Date | string | null;
  durationMinutes?: number;
  objectives?: string | null;
  specificCompetencies?: string | null;
  generalCompetencies?: string | null;
  qualities?: string | null;
  teachingEquipment?: string | null;
  postLessonAdjustment?: string | null;
  notes?: string | null;
  teacherName?: string | null;
  activities: LessonPlanRenderActivity[];
}

export interface WorksheetRenderQuestion {
  id?: string;
  questionType: string;
  content: string;
  optionsJson?: any;
  correctAnswerJson?: any;
  explanation?: string | null;
  sortOrder: number;
}

export interface WorksheetRenderModel {
  id?: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  subjectName?: string | null;
  gradeName?: string | null;
  lessonTitle?: string | null;
  teacherName?: string | null;
  questions: WorksheetRenderQuestion[];
}

export function lessonPlanToRenderModel(plan: any, teacherName?: string): LessonPlanRenderModel {
  return {
    id: plan.id,
    title: plan.title,
    topic: plan.topic || null,
    subjectName: plan.subject?.name || plan.subjectName || plan.subject || 'Toán',
    gradeName: plan.classroom?.name || plan.gradeName || plan.grade || 'Lớp 4A',
    weekNumber: plan.weekNumber || 1,
    periodNumber: plan.periodNumber || 1,
    teachingDate: plan.teachingDate || plan.date || null,
    durationMinutes: plan.durationMinutes || plan.duration || 40,
    objectives: plan.objectives || plan.objective || '',
    specificCompetencies: plan.specificCompetencies || '',
    generalCompetencies: plan.generalCompetencies || '',
    qualities: plan.qualities || '',
    teachingEquipment: plan.teachingEquipment || '',
    postLessonAdjustment: plan.postLessonAdjustment || '',
    notes: plan.notes || '',
    teacherName: teacherName || plan.teacher?.fullName || 'Giáo viên',
    activities: (plan.activities || []).map((activity: any, index: number) => ({
      id: activity.id,
      phase: activity.phase || 'Hoạt động',
      title: activity.title,
      durationMinutes: activity.durationMinutes || activity.minutes || 5,
      method: activity.method || '',
      technique: activity.technique || '',
      competencies: activity.competencies || '',
      qualities: activity.qualities || '',
      objective: activity.objective || '',
      teacherActivity: activity.teacherActivity || activity.teacher || '',
      studentActivity: activity.studentActivity || activity.students || '',
      equipment: activity.equipment || '',
      sortOrder: activity.sortOrder ?? index,
    })),
  };
}

export function worksheetToRenderModel(worksheet: any, teacherName?: string): WorksheetRenderModel {
  return {
    id: worksheet.id,
    title: worksheet.title,
    subtitle: worksheet.subtitle || null,
    description: worksheet.description || null,
    subjectName: worksheet.subject?.name || worksheet.subjectName || 'Toán',
    gradeName: worksheet.grade?.name || worksheet.gradeName || 'Khối 4',
    lessonTitle: worksheet.lesson?.title || worksheet.title,
    teacherName: teacherName || worksheet.teacher?.fullName || 'Giáo viên',
    questions: (worksheet.questions || []).map((question: any, index: number) => ({
      id: question.id,
      questionType: question.questionType || 'MULTIPLE_CHOICE',
      content: question.content,
      optionsJson: question.optionsJson || question.options || [],
      correctAnswerJson: question.correctAnswerJson || question.correctAnswer || question.answer || '',
      explanation: question.explanation || null,
      sortOrder: question.sortOrder ?? index,
    })),
  };
}
