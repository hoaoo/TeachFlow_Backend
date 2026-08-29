import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HtmlGameStatus, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateHtmlGameQuestionDto,
  ReorderHtmlGameQuestionsDto,
  UpdateHtmlGameQuestionDto,
  UpdateTeacherHtmlGameDto,
} from './dto/html-game-question.dto';
import { HTML_GAME_MAX_QUESTIONS } from './html-game.constants';
import { validateQuestionPayload } from './html-game-question.validation';
import { HtmlGamesService } from './html-games.service';

const CUSTOMIZATION_INCLUDE = {
  htmlGame: {
    include: {
      grade: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
    },
  },
  questions: { orderBy: { order: 'asc' as const } },
};

@Injectable()
export class TeacherHtmlGamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly htmlGames: HtmlGamesService,
  ) {}

  async createOrGet(htmlGameId: string, teacherId?: string) {
    this.requireTeacher(teacherId);
    const existing = await this.prisma.teacherHtmlGame.findUnique({
      where: { teacherId_htmlGameId: { teacherId: teacherId!, htmlGameId } },
      include: CUSTOMIZATION_INCLUDE,
    });
    if (existing) return existing;

    const game = await this.prisma.htmlGame.findFirst({
      where: {
        id: htmlGameId,
        status: HtmlGameStatus.PUBLISHED,
        supportsQuestionConfig: true,
      },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!game) throw new NotFoundException('Không tìm thấy trò chơi configurable đã xuất bản');

    try {
      return await this.prisma.$transaction((tx) => tx.teacherHtmlGame.create({
        data: {
          htmlGameId,
          teacherId: teacherId!,
          questions: {
            create: game.questions.map((question) => ({
              order: question.order,
              question: question.question,
              type: question.type,
              options: question.options === null ? undefined : question.options as Prisma.InputJsonValue,
              correctAnswer: question.correctAnswer as Prisma.InputJsonValue,
              explanation: question.explanation,
              metadata: question.metadata === null ? undefined : question.metadata as Prisma.InputJsonValue,
            })),
          },
        },
        include: CUSTOMIZATION_INCLUDE,
      }));
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const winner = await this.prisma.teacherHtmlGame.findUnique({
        where: { teacherId_htmlGameId: { teacherId: teacherId!, htmlGameId } },
        include: CUSTOMIZATION_INCLUDE,
      });
      if (!winner) throw error;
      return winner;
    }
  }

  async get(id: string, teacherId?: string) {
    this.requireTeacher(teacherId);
    const customization = await this.prisma.teacherHtmlGame.findUnique({
      where: { id },
      include: CUSTOMIZATION_INCLUDE,
    });
    if (!customization) throw new NotFoundException('Không tìm thấy bản tùy chỉnh');
    if (customization.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập bản tùy chỉnh này');
    }
    if (customization.htmlGame.status !== HtmlGameStatus.PUBLISHED) {
      throw new NotFoundException('Trò chơi gốc hiện không được xuất bản');
    }
    return customization;
  }

  async update(id: string, dto: UpdateTeacherHtmlGameDto, teacherId?: string) {
    await this.get(id, teacherId);
    return this.prisma.teacherHtmlGame.update({
      where: { id },
      data: { title: dto.title?.trim() || null },
      include: CUSTOMIZATION_INCLUDE,
    });
  }

  async getPlay(id: string, actor: AuthenticatedUser) {
    const customization = await this.get(id, actor.teacherId);
    if (customization.htmlGame.status !== HtmlGameStatus.PUBLISHED) {
      throw new NotFoundException('Trò chơi gốc hiện không được xuất bản');
    }
    const play = await this.htmlGames.getPlay(customization.htmlGameId, actor);
    return {
      ...play,
      customizationId: customization.id,
      title: customization.title || customization.htmlGame.title,
      questions: customization.questions,
    };
  }

  async createQuestion(id: string, dto: CreateHtmlGameQuestionDto, teacherId?: string) {
    const customization = await this.get(id, teacherId);
    if (customization.questions.length >= HTML_GAME_MAX_QUESTIONS) {
      throw new BadRequestException(`Mỗi bộ chỉ hỗ trợ tối đa ${HTML_GAME_MAX_QUESTIONS} câu hỏi`);
    }
    return this.prisma.teacherHtmlGameQuestion.create({
      data: { teacherHtmlGameId: id, ...validateQuestionPayload(dto) } as any,
    });
  }

  async updateQuestion(
    id: string,
    questionId: string,
    dto: UpdateHtmlGameQuestionDto,
    teacherId?: string,
  ) {
    await this.requireOwnedQuestion(id, questionId, teacherId);
    return this.prisma.teacherHtmlGameQuestion.update({
      where: { id: questionId },
      data: validateQuestionPayload(dto),
    });
  }

  async removeQuestion(id: string, questionId: string, teacherId?: string) {
    await this.requireOwnedQuestion(id, questionId, teacherId);
    await this.prisma.teacherHtmlGameQuestion.delete({ where: { id: questionId } });
    const rows = await this.prisma.teacherHtmlGameQuestion.findMany({
      where: { teacherHtmlGameId: id }, orderBy: { order: 'asc' },
    });
    await this.reorderRows(rows.map((row) => row.id));
    return { success: true };
  }

  async reorder(id: string, dto: ReorderHtmlGameQuestionsDto, teacherId?: string) {
    const customization = await this.get(id, teacherId);
    const currentIds = customization.questions.map((question) => question.id);
    if (
      currentIds.length !== dto.questionIds.length ||
      new Set(dto.questionIds).size !== dto.questionIds.length ||
      currentIds.some((questionId) => !dto.questionIds.includes(questionId))
    ) {
      throw new BadRequestException('Danh sách sắp xếp không khớp bộ câu hỏi');
    }
    await this.reorderRows(dto.questionIds);
    return this.get(id, teacherId);
  }

  private async requireOwnedQuestion(id: string, questionId: string, teacherId?: string) {
    this.requireTeacher(teacherId);
    const question = await this.prisma.teacherHtmlGameQuestion.findUnique({
      where: { id: questionId },
      include: { teacherHtmlGame: { include: { htmlGame: true } } },
    });
    if (!question) throw new NotFoundException('Không tìm thấy câu hỏi tùy chỉnh');
    if (question.teacherHtmlGameId !== id || question.teacherHtmlGame.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền sửa câu hỏi này');
    }
    if (question.teacherHtmlGame.htmlGame.status !== HtmlGameStatus.PUBLISHED) {
      throw new NotFoundException('Trò chơi gốc hiện không được xuất bản');
    }
    return question;
  }

  private requireTeacher(teacherId?: string): asserts teacherId is string {
    if (!teacherId) throw new ForbiddenException('Chỉ giáo viên mới có thể tùy chỉnh trò chơi');
  }

  private async reorderRows(ids: string[]) {
    await this.prisma.$transaction(async (tx) => {
      await Promise.all(ids.map((id, index) => tx.teacherHtmlGameQuestion.update({
        where: { id }, data: { order: -(index + 1) },
      })));
      await Promise.all(ids.map((id, index) => tx.teacherHtmlGameQuestion.update({
        where: { id }, data: { order: index },
      })));
    });
  }
}
