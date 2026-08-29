import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateHtmlGameQuestionDto,
  ReorderHtmlGameQuestionsDto,
  UpdateHtmlGameQuestionDto,
} from './dto/html-game-question.dto';
import { HTML_GAME_MAX_QUESTIONS } from './html-game.constants';
import { validateQuestionPayload } from './html-game-question.validation';

@Injectable()
export class HtmlGameQuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(htmlGameId: string) {
    await this.requireConfigurableGame(htmlGameId);
    return this.prisma.htmlGameQuestion.findMany({
      where: { htmlGameId },
      orderBy: { order: 'asc' },
    });
  }

  async create(htmlGameId: string, dto: CreateHtmlGameQuestionDto) {
    await this.requireConfigurableGame(htmlGameId);
    const count = await this.prisma.htmlGameQuestion.count({ where: { htmlGameId } });
    if (count >= HTML_GAME_MAX_QUESTIONS) {
      throw new BadRequestException(`Mỗi trò chơi chỉ hỗ trợ tối đa ${HTML_GAME_MAX_QUESTIONS} câu hỏi`);
    }
    return this.prisma.htmlGameQuestion.create({
      data: { htmlGameId, ...validateQuestionPayload(dto) } as any,
    });
  }

  async update(htmlGameId: string, questionId: string, dto: UpdateHtmlGameQuestionDto) {
    await this.requireQuestion(htmlGameId, questionId);
    return this.prisma.htmlGameQuestion.update({
      where: { id: questionId },
      data: validateQuestionPayload(dto),
    });
  }

  async remove(htmlGameId: string, questionId: string) {
    await this.requireQuestion(htmlGameId, questionId);
    await this.prisma.htmlGameQuestion.delete({ where: { id: questionId } });
    await this.normalizeOrder(htmlGameId);
    return { success: true };
  }

  async reorder(htmlGameId: string, dto: ReorderHtmlGameQuestionsDto) {
    await this.requireConfigurableGame(htmlGameId);
    const questions = await this.prisma.htmlGameQuestion.findMany({ where: { htmlGameId } });
    if (
      questions.length !== dto.questionIds.length ||
      new Set(dto.questionIds).size !== dto.questionIds.length ||
      questions.some((question) => !dto.questionIds.includes(question.id))
    ) {
      throw new BadRequestException('Danh sách sắp xếp không khớp bộ câu hỏi');
    }
    await this.reorderRows(dto.questionIds);
    return this.list(htmlGameId);
  }

  private async requireConfigurableGame(id: string) {
    const game = await this.prisma.htmlGame.findUnique({ where: { id } });
    if (!game) throw new NotFoundException('Không tìm thấy trò chơi HTML');
    if (!game.supportsQuestionConfig) {
      throw new BadRequestException('Trò chơi legacy không hỗ trợ cấu hình câu hỏi');
    }
    return game;
  }

  private async requireQuestion(htmlGameId: string, questionId: string) {
    await this.requireConfigurableGame(htmlGameId);
    const question = await this.prisma.htmlGameQuestion.findUnique({ where: { id: questionId } });
    if (!question || question.htmlGameId !== htmlGameId) {
      throw new NotFoundException('Không tìm thấy câu hỏi của trò chơi');
    }
    return question;
  }

  private async normalizeOrder(htmlGameId: string) {
    const rows = await this.prisma.htmlGameQuestion.findMany({
      where: { htmlGameId },
      orderBy: { order: 'asc' },
    });
    await this.reorderRows(rows.map((row) => row.id));
  }

  private async reorderRows(ids: string[]) {
    await this.prisma.$transaction(async (tx) => {
      await Promise.all(ids.map((id, index) => tx.htmlGameQuestion.update({
        where: { id }, data: { order: -(index + 1) },
      })));
      await Promise.all(ids.map((id, index) => tx.htmlGameQuestion.update({
        where: { id }, data: { order: index },
      })));
    });
  }
}
