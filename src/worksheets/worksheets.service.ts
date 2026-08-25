import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorksheetDto } from './dto/create-worksheet.dto';
import { UpdateWorksheetDto } from './dto/update-worksheet.dto';
import { AssignWorksheetDto } from './dto/assign-worksheet.dto';
import { WorksheetQuestionInputDto } from './dto/worksheet-question.dto';
import { worksheetToRenderModel, WorksheetRenderModel } from '../export/render-models';

const QUESTION_TYPES = new Set([
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'FILL_BLANK',
  'MATCHING',
  'ESSAY',
]);

@Injectable()
export class WorksheetsService {
  constructor(private prisma: PrismaService) {}

  async findAll(teacherId?: string) {
    const where: any = { deletedAt: null };
    if (teacherId) {
      where.teacherId = teacherId;
    }

    const worksheets = await this.prisma.worksheet.findMany({
      where,
      include: {
        subject: true,
        grade: true,
        questions: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return worksheets.map((w) => this.mapWorksheet(w));
  }

  async findOne(id: string, teacherId?: string) {
    const worksheet = await this.prisma.worksheet.findUnique({
      where: { id },
      include: {
        subject: true,
        grade: true,
        classroom: true,
        lesson: true,
        questions: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!worksheet || worksheet.deletedAt) {
      throw new NotFoundException(`Không tìm thấy phiếu học tập ${id}`);
    }

    if (teacherId && worksheet.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập phiếu học tập này');
    }

    return this.mapWorksheet(worksheet);
  }

  async previewById(id: string, teacherId?: string): Promise<WorksheetRenderModel> {
    const worksheet = await this.findOne(id, teacherId);
    return worksheetToRenderModel(worksheet);
  }

  previewDraft(dto: CreateWorksheetDto | UpdateWorksheetDto, teacherName?: string): WorksheetRenderModel {
    return worksheetToRenderModel(
      {
        title: dto.title || 'Phiếu học tập',
        subtitle: dto.subtitle,
        description: dto.description,
        questions: (dto.questions || []).map((question, index) => this.normalizeQuestion(question, index)),
      },
      teacherName,
    );
  }

  async create(dto: CreateWorksheetDto, teacherId: string) {
    const questions = (dto.questions || []).map((question, index) => this.normalizeQuestion(question, index));

    const worksheet = await this.prisma.worksheet.create({
      data: {
        teacherId,
        title: dto.title,
        subtitle: dto.subtitle || 'Toán · Lớp 4',
        status: dto.status || 'Bản nháp',
        meta: dto.meta || `${questions.length} câu hỏi · Vừa tạo`,
        tone: dto.tone || 'teal',
        description: dto.description,
        subjectId: dto.subjectId,
        gradeId: dto.gradeId,
        classroomId: dto.classroomId,
        questions: questions.length
          ? {
              create: questions.map((question) => ({
                questionType: question.questionType as any,
                content: question.content,
                optionsJson: question.options ?? [],
                correctAnswerJson: question.correctAnswer ?? null,
                explanation: question.explanation || null,
                sortOrder: question.sortOrder ?? 0,
              })),
            }
          : undefined,
      },
      include: {
        subject: true,
        grade: true,
        questions: { orderBy: { sortOrder: 'asc' } },
      },
    });

    return this.mapWorksheet(worksheet);
  }

  async update(id: string, dto: UpdateWorksheetDto, teacherId: string) {
    await this.findOne(id, teacherId);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.questions) {
        await tx.worksheetQuestion.deleteMany({ where: { worksheetId: id } });
        if (dto.questions.length > 0) {
          await tx.worksheetQuestion.createMany({
            data: dto.questions.map((question, index) => {
              const normalized = this.normalizeQuestion(question, index);
              return {
                worksheetId: id,
                questionType: normalized.questionType as any,
                content: normalized.content,
                optionsJson: normalized.options ?? [],
                correctAnswerJson: normalized.correctAnswer ?? null,
                explanation: normalized.explanation || null,
                sortOrder: normalized.sortOrder ?? index,
              };
            }),
          });
        }
      }

      return tx.worksheet.update({
        where: { id },
        data: {
          title: dto.title,
          subtitle: dto.subtitle,
          status: dto.status,
          meta: dto.questions ? `${dto.questions.length} câu hỏi` : dto.meta,
          tone: dto.tone,
          description: dto.description,
          subjectId: dto.subjectId,
          gradeId: dto.gradeId,
          classroomId: dto.classroomId,
        },
        include: {
          subject: true,
          grade: true,
          questions: { orderBy: { sortOrder: 'asc' } },
        },
      });
    });

    return this.mapWorksheet(updated);
  }

  async remove(id: string, teacherId: string) {
    await this.findOne(id, teacherId);

    await this.prisma.worksheet.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true, message: 'Đã xóa phiếu học tập' };
  }

  async duplicate(id: string, teacherId: string) {
    const original = await this.findOne(id, teacherId);

    const copy = await this.prisma.worksheet.create({
      data: {
        teacherId,
        title: `${original.title} (Bản sao)`,
        subtitle: original.subtitle,
        status: 'Bản nháp',
        meta: 'Vừa nhân bản',
        tone: original.tone || 'teal',
        description: original.description,
        subjectId: original.subjectId,
        gradeId: original.gradeId,
        questions: original.questions?.length
          ? {
              create: original.questions.map((question, index) => ({
                questionType: question.questionType as any,
                content: question.content,
                optionsJson: question.optionsJson ?? [],
                correctAnswerJson: question.correctAnswerJson ?? null,
                explanation: question.explanation || null,
                sortOrder: question.sortOrder ?? index,
              })),
            }
          : undefined,
      },
      include: {
        subject: true,
        grade: true,
        questions: { orderBy: { sortOrder: 'asc' } },
      },
    });

    return this.mapWorksheet(copy);
  }

  async assign(id: string, dto: AssignWorksheetDto, teacherId: string) {
    if (!teacherId) {
      throw new ForbiddenException('Tài khoản hiện tại không có hồ sơ giáo viên');
    }

    const worksheet = await this.findOne(id, teacherId);
    const classroom = await this.prisma.classroom.findFirst({
      where: {
        id: dto.classroomId,
        isActive: true,
        deletedAt: null,
        OR: [
          { teacherId },
          { homeroomTeacherId: teacherId },
          { teachingAssignments: { some: { teacherId, isActive: true } } },
        ],
      },
      select: { id: true, name: true, code: true },
    });

    if (!classroom) {
      throw new ForbiddenException('Bạn không có quyền giao phiếu cho lớp này');
    }

    try {
      const assignment = await this.prisma.worksheetAssignment.create({
        data: {
          worksheetId: worksheet.id,
          classroomId: classroom.id,
          teacherId,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        },
        include: {
          classroom: { select: { id: true, name: true, code: true } },
        },
      });

      return {
        id: assignment.id,
        worksheetId: assignment.worksheetId,
        classroom: assignment.classroom,
        assignedAt: assignment.assignedAt,
        dueAt: assignment.dueAt,
        status: assignment.status,
      };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Phiếu học tập đã được giao cho lớp này');
      }
      throw error;
    }
  }

  async getAssignments(id: string, teacherId: string) {
    await this.findOne(id, teacherId);

    return this.prisma.worksheetAssignment.findMany({
      where: { worksheetId: id, teacherId },
      include: {
        classroom: { select: { id: true, name: true, code: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async getClassroomAssignments(classroomId: string, teacherId: string) {
    const classroom = await this.prisma.classroom.findFirst({
      where: {
        id: classroomId,
        isActive: true,
        deletedAt: null,
        OR: [
          { teacherId },
          { homeroomTeacherId: teacherId },
          { teachingAssignments: { some: { teacherId, isActive: true } } },
        ],
      },
      select: { id: true },
    });

    if (!classroom) {
      throw new ForbiddenException('Bạn không có quyền truy cập lớp này');
    }

    return this.prisma.worksheetAssignment.findMany({
      where: { classroomId, teacherId },
      include: {
        worksheet: {
          select: { id: true, title: true, status: true, subjectId: true, gradeId: true },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }
  private normalizeQuestion(question: WorksheetQuestionInputDto, index: number) {
    const questionType = QUESTION_TYPES.has(question.questionType)
      ? question.questionType
      : 'MULTIPLE_CHOICE';
    return {
      questionType,
      content: question.content,
      options: question.options || [],
      correctAnswer: question.correctAnswer ?? null,
      explanation: question.explanation || null,
      sortOrder: question.sortOrder ?? index,
    };
  }

  private mapWorksheet(w: any) {
    return {
      id: w.id,
      title: w.title,
      subtitle: w.subtitle || `${w.subject?.name || 'Toán'} · ${w.grade?.name || 'Lớp 4'}`,
      description: w.description || '',
      status: w.status || 'Đã xuất bản',
      meta: w.meta || `${w.questions?.length || 0} câu hỏi`,
      tone: w.tone || 'teal',
      subjectId: w.subjectId,
      gradeId: w.gradeId,
      classroomId: w.classroomId,
      subject: w.subject ? { id: w.subject.id, name: w.subject.name } : undefined,
      grade: w.grade ? { id: w.grade.id, name: w.grade.name } : undefined,
      questions: (w.questions || []).map((question: any) => ({
        id: question.id,
        worksheetId: question.worksheetId || w.id,
        questionType: question.questionType,
        content: question.content,
        optionsJson: question.optionsJson,
        options: Array.isArray(question.optionsJson) ? question.optionsJson : question.options || [],
        correctAnswerJson: question.correctAnswerJson,
        correctAnswer: question.correctAnswerJson,
        explanation: question.explanation,
        sortOrder: question.sortOrder,
      })),
      questionsCount: w.questions?.length || 0,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    };
  }
}
