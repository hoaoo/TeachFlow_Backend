import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LessonPlanExportService, LessonPlanExportData } from './lesson-plan-export.service';
import { WorksheetExportService, WorksheetExportData } from './worksheet-export.service';
import { lessonPlanToRenderModel, worksheetToRenderModel } from './render-models';
import { sanitizeFilename } from './export.utils';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private prisma: PrismaService,
    private lessonPlanExportService: LessonPlanExportService,
    private worksheetExportService: WorksheetExportService,
  ) {}

  private async getTeacherId(user: AuthenticatedUser): Promise<string | null> {
    if (user.teacherId) {
      return user.teacherId;
    }
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: user.userId },
      select: { id: true },
    });
    return teacher?.id || null;
  }

  /**
   * Export Lesson Plan as DOCX
   */
  async exportLessonPlanDocx(id: string, user: AuthenticatedUser) {
    const data = await this.getLessonPlanData(id, user);
    const buffer = await this.lessonPlanExportService.generateDocx(data);
    const rawFilename = `Giao_an_${data.title}_${data.gradeName || 'Lop_4'}`;
    const { asciiFilename, utf8Filename } = sanitizeFilename(rawFilename, 'docx');

    return { buffer, asciiFilename, utf8Filename };
  }

  /**
   * Export Lesson Plan as PDF
   */
  async exportLessonPlanPdf(id: string, user: AuthenticatedUser) {
    const data = await this.getLessonPlanData(id, user);
    const buffer = await this.lessonPlanExportService.generatePdf(data);
    const rawFilename = `Giao_an_${data.title}_${data.gradeName || 'Lop_4'}`;
    const { asciiFilename, utf8Filename } = sanitizeFilename(rawFilename, 'pdf');

    return { buffer, asciiFilename, utf8Filename };
  }

  /**
   * Export Worksheet as DOCX
   */
  async exportWorksheetDocx(id: string, user: AuthenticatedUser, includeAnswers = false) {
    const data = await this.getWorksheetData(id, user);
    const buffer = await this.worksheetExportService.generateDocx(data, includeAnswers);
    const answerSuffix = includeAnswers ? '_Co_dap_an' : '';
    const rawFilename = `Phieu_hoc_tap_${data.title}_${data.gradeName || 'Lop_4'}${answerSuffix}`;
    const { asciiFilename, utf8Filename } = sanitizeFilename(rawFilename, 'docx');

    return { buffer, asciiFilename, utf8Filename };
  }

  /**
   * Export Worksheet as PDF
   */
  async exportWorksheetPdf(id: string, user: AuthenticatedUser, includeAnswers = false) {
    const data = await this.getWorksheetData(id, user);
    const buffer = await this.worksheetExportService.generatePdf(data, includeAnswers);
    const answerSuffix = includeAnswers ? '_Co_dap_an' : '';
    const rawFilename = `Phieu_hoc_tap_${data.title}_${data.gradeName || 'Lop_4'}${answerSuffix}`;
    const { asciiFilename, utf8Filename } = sanitizeFilename(rawFilename, 'pdf');

    return { buffer, asciiFilename, utf8Filename };
  }

  private async getLessonPlanData(id: string, user: AuthenticatedUser): Promise<LessonPlanExportData> {
    const plan = await this.prisma.lessonPlan.findUnique({
      where: { id },
      include: {
        activities: { orderBy: { sortOrder: 'asc' } },
        classroom: true,
        subject: true,
        teacher: true,
      },
    });

    if (!plan || plan.deletedAt) {
      throw new NotFoundException(`Không tìm thấy giáo án với mã ${id}`);
    }

    const currentTeacherId = await this.getTeacherId(user);
    if (user.role !== 'ADMIN' && plan.teacherId !== currentTeacherId) {
      throw new ForbiddenException('Bạn không có quyền xuất giáo án này');
    }

    return lessonPlanToRenderModel(plan) as LessonPlanExportData;
  }

  private async getWorksheetData(id: string, user: AuthenticatedUser): Promise<WorksheetExportData> {
    const worksheet = await this.prisma.worksheet.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { sortOrder: 'asc' } },
        classroom: true,
        subject: true,
        grade: true,
        lesson: true,
        teacher: true,
      },
    });

    if (!worksheet || worksheet.deletedAt) {
      throw new NotFoundException(`Không tìm thấy phiếu học tập với mã ${id}`);
    }

    const currentTeacherId = await this.getTeacherId(user);
    if (user.role !== 'ADMIN' && worksheet.teacherId !== currentTeacherId) {
      throw new ForbiddenException('Bạn không có quyền xuất phiếu học tập này');
    }

    return worksheetToRenderModel(worksheet) as WorksheetExportData;
  }
}
