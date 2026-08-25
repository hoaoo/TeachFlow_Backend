import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

import { GenerateLessonPlanDto } from './dto/generate-lesson-plan.dto';
import { GenerateActivityDto } from './dto/generate-activity.dto';
import { GenerateWorksheetDto } from './dto/generate-worksheet.dto';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import { GenerateStudentCommentDto } from './dto/generate-student-comment.dto';
import { GenerateImageDto } from './dto/generate-image.dto';
import { AnalyzeImportDto } from './dto/analyze-import.dto';
import { GenerateHomeroomSummaryDto } from './dto/generate-homeroom-summary.dto';
import {
  GeneratedActivityStandaloneOutputDto,
  GeneratedQuestionsOutputDto,
  GeneratedStudentCommentOutputDto,
} from './dto/generated-outputs.dto';

import { activitySchema } from './schemas/activity.schema';
import { questionsSchema } from './schemas/questions.schema';
import { studentCommentSchema } from './schemas/student-comment.schema';
import { homeroomSummarySchema } from './schemas/homeroom-summary.schema';

import { buildActivityPrompt } from './prompts/activity.prompt';
import { buildQuestionsPrompt } from './prompts/questions.prompt';
import { buildStudentCommentPrompt, AnonymizedStudentProfile } from './prompts/student-comment.prompt';
import { validateAiOutput } from './validation/validate-ai-output';

import { GeminiProvider } from './providers/gemini.provider';
import { LessonPlanAiService } from './lesson-plan-ai.service';
import { WorksheetAiService } from './worksheet-ai.service';
import { ImageAiService } from './image-ai.service';
import { ImportAiService } from './import-ai.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly provider: GeminiProvider,
    private readonly prisma: PrismaService,
    private readonly classroomAccess: TeachingAssignmentAuthorizationService,
    private readonly lessonPlanAi: LessonPlanAiService,
    private readonly worksheetAi: WorksheetAiService,
    private readonly imageAi: ImageAiService,
    private readonly importAi: ImportAiService,
  ) {}

  async generateLessonPlan(dto: GenerateLessonPlanDto) {
    const result = await this.lessonPlanAi.generate(dto);
    return {
      ...result,
      editorDraft: this.lessonPlanAi.toEditorDraft(result, dto),
    };
  }

  async generateActivity(dto: GenerateActivityDto) {
    const prompt = buildActivityPrompt(dto);
    return this.provider.generateStructured({
      operation: 'activity',
      prompt,
      schema: activitySchema,
      validate: (raw) => validateAiOutput(GeneratedActivityStandaloneOutputDto, raw),
    });
  }

  async generateWorksheet(dto: GenerateWorksheetDto) {
    const result = await this.worksheetAi.generate(dto);
    return {
      ...result,
      editorDraft: this.worksheetAi.toEditorDraft(result, dto),
    };
  }

  async generateQuestions(dto: GenerateQuestionsDto) {
    const prompt = buildQuestionsPrompt(dto);
    return this.provider.generateStructured({
      operation: 'questions',
      prompt,
      schema: questionsSchema,
      validate: (raw) => validateAiOutput(GeneratedQuestionsOutputDto, raw),
    });
  }

  async generateHomeroomSummary(dto: GenerateHomeroomSummaryDto, user: AuthenticatedUser) {
    if (!user.teacherId) throw new ForbiddenException('TEACHER_NOT_FOUND');
    await this.classroomAccess.assertTeacherCanAccessClassroom(dto.classroomId, user.teacherId);
    const [studentCount, attendanceCount, behaviorCount, assessmentCount] = await Promise.all([
      this.prisma.studentEnrollment.count({ where: { classroomId: dto.classroomId, status: 'ACTIVE', student: { deletedAt: null } } }),
      this.prisma.attendanceSession.count({ where: { classroomId: dto.classroomId, teacherId: user.teacherId } }),
      this.prisma.studentBehaviorRecord.count({ where: { classroomId: dto.classroomId, teacherId: user.teacherId } }),
      this.prisma.assessment.count({ where: { classroomId: dto.classroomId, teacherId: user.teacherId, deletedAt: null } }),
    ]);
    const prompt = [
      'Tạo bản nháp tổng hợp lớp tiểu học bằng tiếng Việt, không nêu tên học sinh.',
      `Kỳ: ${dto.period}; Sĩ số active: ${studentCount}; buổi điểm danh: ${attendanceCount}; ghi nhận nề nếp: ${behaviorCount}; bài đánh giá: ${assessmentCount}.`,
      'Chỉ đề xuất để giáo viên duyệt, không tự ghi cơ sở dữ liệu.',
    ].join('\n');
    return this.provider.generateStructured({
      operation: 'homeroom-summary',
      prompt,
      schema: homeroomSummarySchema,
      validate: (raw) => {
        const value: any = raw;
        if (!value || typeof value.summary !== 'string' || !Array.isArray(value.strengths) || !Array.isArray(value.concerns) || !Array.isArray(value.nextSteps)) {
          throw new Error('INVALID_AI_HOMEROOM_SUMMARY');
        }
        return value;
      },
    });
  }

  async generateStudentComment(dto: GenerateStudentCommentDto, user?: AuthenticatedUser) {
    if (dto.studentId && user?.teacherId) {
      await this.assertTeacherCanUseStudent(dto.studentId, user.teacherId);
    }

    const profile: AnonymizedStudentProfile = {
      subject: dto.subject || 'Tổng hợp',
      criteria: dto.criteria || {},
      assessmentLevel: dto.assessmentLevel || 'Đạt',
      notes: dto.notes,
    };

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
      } catch {
        this.logger.warn('Could not load anonymized assessment details for student comment');
      }
    }

    const prompt = buildStudentCommentPrompt(profile);
    return this.provider.generateStructured({
      operation: 'student-comment',
      prompt,
      schema: studentCommentSchema,
      validate: (raw) => validateAiOutput(GeneratedStudentCommentOutputDto, raw),
    });
  }

  async generateImage(dto: GenerateImageDto, user: AuthenticatedUser) {
    return this.imageAi.generate(dto, user);
  }

  async analyzeImport(file: Express.Multer.File, dto: AnalyzeImportDto, user: AuthenticatedUser) {
    return this.importAi.analyze(file, dto, user);
  }

  private async assertTeacherCanUseStudent(studentId: string, teacherId: string) {
    const accessible = await this.classroomAccess.getAccessibleClassroomIds(teacherId);
    if (accessible.length === 0) {
      throw new ForbiddenException('Bạn không có quyền sử dụng dữ liệu học sinh này');
    }
    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: {
        studentId,
        classroomId: { in: accessible },
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!enrollment) {
      throw new ForbiddenException('Bạn không có quyền sử dụng dữ liệu học sinh này');
    }
  }
}
