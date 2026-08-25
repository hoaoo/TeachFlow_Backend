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
import { AiChatDto } from './dto/ai-chat.dto';
import * as XLSX from 'xlsx';
import * as path from 'path';
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

  async chat(dto: AiChatDto, file: Express.Multer.File | undefined, user: AuthenticatedUser) {
    const teacherName = user?.teacherName || 'thầy/cô';
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    let fileContext = '';
    let inlinePart: { mimeType: string; data: string } | undefined;

    if (file) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const baseName = path.basename(file.originalname || 'document');

      if (['.xlsx', '.xls', '.csv'].includes(ext)) {
        try {
          const workbook = XLSX.read(file.buffer, { type: 'buffer' });
          const sheetsData: string[] = [];
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet);
            sheetsData.push(`--- Bảng tính: ${sheetName} ---\n${csv.slice(0, 10000)}`);
          }
          fileContext = `\n[Tệp đính kèm: ${baseName} (${ext})]\nNội dung bảng tính:\n${sheetsData.join('\n\n')}\n`;
        } catch {
          fileContext = `\n[Tệp đính kèm: ${baseName} (${ext})]\n`;
        }
      } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        inlinePart = {
          mimeType,
          data: file.buffer.toString('base64'),
        };
        fileContext = `\n[Tệp đính kèm hình ảnh: ${baseName}]\nHãy phân tích và trích xuất thông tin chi tiết từ hình ảnh này.\n`;
      } else if (ext === '.pdf') {
        inlinePart = {
          mimeType: 'application/pdf',
          data: file.buffer.toString('base64'),
        };
        fileContext = `\n[Tệp đính kèm PDF: ${baseName}]\nHãy đọc và phân tích nội dung từ tệp PDF này.\n`;
      } else if (ext === '.docx' || ext === '.doc') {
        inlinePart = {
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          data: file.buffer.toString('base64'),
        };
        fileContext = `\n[Tệp đính kèm Word: ${baseName}]\nHãy đọc và phân tích nội dung từ tệp văn bản này.\n`;
      } else {
        const textContent = file.buffer.toString('utf8').replace(/\u0000/g, '').slice(0, 10000);
        fileContext = `\n[Tệp đính kèm: ${baseName}]\nNội dung văn bản:\n${textContent}\n`;
      }
    }

    const promptParts = [
      `Bạn là Trợ lý Sư phạm Thông minh TeachFlow đồng hành cùng ${teacherName}.`,
      dto.context ? `Ngữ cảnh lớp học/môn học: ${dto.context}` : '',
      dto.history ? `Lịch sử trao đổi trước đó:\n${dto.history}` : '',
      fileContext,
      `Yêu cầu hiện tại của ${teacherName}:`,
      dto.message,
      '',
      'Hãy trả lời chi tiết, chuyên nghiệp, chuẩn mực theo định hướng Chương trình Giáo dục Phổ thông Việt Nam (GDPT).',
      'Nếu là câu hỏi sư phạm, hãy đưa ra hướng dẫn rõ ràng, ví dụ cụ thể hoặc các bước thực hiện sinh động.',
    ];

    const fullPrompt = promptParts.filter(Boolean).join('\n');

    const responseText = await this.provider.generateText({
      operation: 'chat',
      prompt: fullPrompt,
      inlineParts: inlinePart ? [inlinePart] : undefined,
    });

    const route = this.provider.getRouteForOperation('chat');
    this.logger.log(
      `[AI Chat] requestId=${requestId} messageId=${messageId} providerResultReceived=true controllerResponseSent=true contentLength=${responseText?.length || 0}`,
    );

    return {
      messageId,
      content: responseText,
      reply: responseText,
      text: responseText,
      response: responseText,
      provider: 'google',
      modelUsed: route.primaryModel,
      fallbackUsed: false,
      generatedAt: new Date().toISOString(),
      fileName: file?.originalname,
    };
  }

  async generateHomeroomSummary(dto: GenerateHomeroomSummaryDto, user: AuthenticatedUser) {
    if (!user.teacherId) throw new ForbiddenException('TEACHER_NOT_FOUND');
    await this.classroomAccess.assertTeacherCanAccessClassroom(dto.classroomId, user.teacherId);

    const [classroom, activeEnrollments, attendances, behaviors, assessments, comments] =
      await Promise.all([
        this.prisma.classroom.findUnique({
          where: { id: dto.classroomId },
          include: { grade: true, schoolYear: true },
        }),
        this.prisma.studentEnrollment.findMany({
          where: { classroomId: dto.classroomId, status: 'ACTIVE', student: { deletedAt: null } },
          include: { student: true },
        }),
        this.prisma.attendanceSession.findMany({
          where: { classroomId: dto.classroomId },
          take: 10,
          orderBy: { attendanceDate: 'desc' },
          include: { attendances: true },
        }),
        this.prisma.studentBehaviorRecord.findMany({
          where: { classroomId: dto.classroomId },
          take: 20,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.assessment.findMany({
          where: { classroomId: dto.classroomId, deletedAt: null },
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: { subject: true },
        }),
        this.prisma.studentComment.findMany({
          where: { classroomId: dto.classroomId },
          take: 10,
          orderBy: { commentDate: 'desc' },
        }),
      ]);

    const studentCount = activeEnrollments.length;
    const positiveBehaviors = behaviors.filter((b) => b.level === 'POSITIVE').length;
    const attentionBehaviors = behaviors.filter((b) => b.level === 'NEEDS_ATTENTION' || b.level === 'REMINDER').length;

    let totalRecordedAttendances = 0;
    let presentAttendances = 0;
    attendances.forEach((s) => {
      (s.attendances || []).forEach((a) => {
        totalRecordedAttendances++;
        if (a.status === 'PRESENT' || a.status === 'LATE') presentAttendances++;
      });
    });
    const attRate = totalRecordedAttendances > 0 ? Math.round((presentAttendances / totalRecordedAttendances) * 100) : 100;

    const recentSubjects = Array.from(new Set(assessments.map((a) => a.subject?.name).filter(Boolean)));

    const periodLabel = dto.period === 'MONTH' ? 'Tháng' : `Tuần ${dto.weekNumber || 1}`;
    const className = classroom?.name || 'Lớp học';
    const gradeName = classroom?.grade?.name || 'Tiểu học';

    const prompt = [
      `Bạn là trợ lý giáo viên chủ nhiệm lớp ${className} (${gradeName}).`,
      `Hãy lập Báo cáo tổng hợp đánh giá hoạt động ${periodLabel} của lớp với các dữ liệu thực tế sau:`,
      `- Sĩ số học sinh: ${studentCount} em`,
      `- Tỷ lệ chuyên cần trung bình: ${attRate}% (qua ${attendances.length} buổi điểm danh)`,
      `- Nề nếp tác phong: ${positiveBehaviors} lượt khen ngợi/tuyên dương, ${attentionBehaviors} lượt nhắc nhở`,
      recentSubjects.length > 0 ? `- Các môn học/chủ đề đánh giá gần đây: ${recentSubjects.join(', ')}` : '',
      comments.length > 0 ? `- Nhận xét sư phạm gần đây: ${comments.slice(0, 3).map((c) => c.content).join('; ')}` : '',
      '',
      'Yêu cầu:',
      '1. summary: Nhận xét tổng quát xúc tích về tình hình nề nếp và học tập của lớp trong giai đoạn vừa qua.',
      '2. strengths: 3-5 gạch đầu dòng về các mặt tích cực, tiến bộ của học sinh và tập thể.',
      '3. concerns: 2-3 điểm còn tồn tại hoặc nhóm học sinh cần lưu ý theo dõi, hỗ trợ.',
      '4. nextSteps: 3-4 biện pháp/kế hoạch cụ thể cho tuần hoặc tháng tiếp theo.',
      'Ngôn từ chuẩn mực sư phạm tiểu học Việt Nam, tích cực và mang tính xây dựng.',
    ].filter(Boolean).join('\n');

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
