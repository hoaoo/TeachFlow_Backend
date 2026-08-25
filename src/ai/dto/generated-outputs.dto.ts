import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

function joinIfArray(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean).join('\n');
  }
  return value;
}

function toStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item)).filter((item) => item.trim() !== '');
  if (typeof value === 'string') {
    return value
      .split(/[;,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

const ACTIVITY_TYPES = ['WARM_UP', 'EXPLORE', 'PRACTICE', 'APPLICATION', 'OTHER'] as const;
const QUESTION_TYPES = ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'MATCHING', 'ESSAY'] as const;

export function normalizeActivityType(value: unknown): string {
  const raw = String(value || '').trim().toUpperCase();
  if (ACTIVITY_TYPES.includes(raw as (typeof ACTIVITY_TYPES)[number])) return raw;
  if (raw.includes('WARM') || raw.includes('KHỞI') || raw.includes('KHOI')) return 'WARM_UP';
  if (raw.includes('EXPLORE') || raw.includes('KHÁM') || raw.includes('KHAM')) return 'EXPLORE';
  if (raw.includes('PRACTICE') || raw.includes('LUYỆN') || raw.includes('LUYEN')) return 'PRACTICE';
  if (raw.includes('APPLY') || raw.includes('APPLICATION') || raw.includes('VẬN') || raw.includes('VAN')) {
    return 'APPLICATION';
  }
  return 'OTHER';
}

export function normalizeQuestionType(value: unknown): string {
  const raw = String(value || '').trim().toUpperCase();
  if (QUESTION_TYPES.includes(raw as (typeof QUESTION_TYPES)[number])) return raw;
  if (raw.includes('MULTIPLE') || raw.includes('TRẮC') || raw.includes('TRAC')) return 'MULTIPLE_CHOICE';
  if (raw.includes('TRUE') || raw.includes('ĐÚNG') || raw.includes('DUNG') || raw.includes('SAI')) return 'TRUE_FALSE';
  if (raw.includes('FILL') || raw.includes('ĐIỀN') || raw.includes('DIEN') || raw.includes('KHUYẾT')) return 'FILL_BLANK';
  if (raw.includes('MATCH') || raw.includes('NỐI') || raw.includes('NOI')) return 'MATCHING';
  if (raw.includes('ESSAY') || raw.includes('TỰ LUẬN') || raw.includes('TU LUAN')) return 'ESSAY';
  return 'MULTIPLE_CHOICE';
}

export class GeneratedActivityOutputDto {
  @IsOptional()
  @Transform(({ value }) => normalizeActivityType(value))
  @IsString()
  activityType?: string;

  @IsString({ message: 'Tên hoạt động không hợp lệ' })
  @IsNotEmpty({ message: 'Tên hoạt động không được để trống' })
  @MaxLength(300)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  objective?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(90)
  durationMinutes: number;

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  methods?: string[];

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  techniques?: string[];

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  competencies?: string[];

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  qualities?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  teacherActivity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  studentActivity?: string;
}

export class GeneratedLessonPlanOutputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @Transform(({ value }) => joinIfArray(value))
  @IsString()
  @MaxLength(8000)
  objectives: string;

  @IsOptional()
  @Transform(({ value }) => joinIfArray(value))
  @IsString()
  @MaxLength(4000)
  specificCompetencies?: string;

  @IsOptional()
  @Transform(({ value }) => joinIfArray(value))
  @IsString()
  @MaxLength(4000)
  generalCompetencies?: string;

  @IsOptional()
  @Transform(({ value }) => joinIfArray(value))
  @IsString()
  @MaxLength(4000)
  qualities?: string;

  @Transform(({ value }) => joinIfArray(value))
  @IsString()
  @MaxLength(4000)
  teachingEquipment: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Giáo án phải có ít nhất một hoạt động' })
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => GeneratedActivityOutputDto)
  activities: GeneratedActivityOutputDto[];
}

export class GeneratedQuestionOutputDto {
  @IsOptional()
  @Transform(({ value }) => normalizeQuestionType(value))
  @IsIn(QUESTION_TYPES)
  questionType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  level?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content: string;

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : String(value)))
  @IsString()
  @MaxLength(4000)
  correctAnswer?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : String(value)))
  @IsString()
  @MaxLength(4000)
  answer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  explanation?: string;
}

export class GeneratedWorksheetOutputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => GeneratedQuestionOutputDto)
  questions: GeneratedQuestionOutputDto[];
}

export class GeneratedQuestionsOutputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  topic: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => GeneratedQuestionOutputDto)
  questions: GeneratedQuestionOutputDto[];
}

export class GeneratedStudentCommentOutputDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  comments: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  overallAssessment: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  recommendations: string;
}

export class GeneratedActivityStandaloneOutputDto extends GeneratedActivityOutputDto {}

export class ImportStudentRowOutputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  studentCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  dob?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  parentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  parentPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ImportStudentsOutputDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ImportStudentRowOutputDto)
  students: ImportStudentRowOutputDto[];
}

export class ImportLessonPlanOutputDto extends GeneratedLessonPlanOutputDto {}

export class ImportWorksheetOutputDto extends GeneratedWorksheetOutputDto {}
