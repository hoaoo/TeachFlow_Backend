import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HtmlGameQuestionType } from '@prisma/client';
import { HtmlGameQuestionsService } from './html-game-questions.service';

describe('HtmlGameQuestionsService', () => {
  let prisma: any;
  let service: HtmlGameQuestionsService;
  const game = { id: 'game-1', supportsQuestionConfig: true };
  const question = {
    id: '11111111-1111-4111-8111-111111111111',
    htmlGameId: 'game-1',
    order: 0,
    question: '2 + 2 = ?',
    type: HtmlGameQuestionType.SINGLE_CHOICE,
    options: ['3', '4'],
    correctAnswer: '4',
  };

  beforeEach(() => {
    prisma = {
      htmlGame: { findUnique: jest.fn().mockResolvedValue(game) },
      htmlGameQuestion: {
        findMany: jest.fn().mockResolvedValue([question]),
        findUnique: jest.fn().mockResolvedValue(question),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue(question),
        update: jest.fn().mockResolvedValue(question),
        delete: jest.fn().mockResolvedValue(question),
      },
      $transaction: jest.fn(async (callback: any) => callback({
        htmlGameQuestion: { update: jest.fn().mockResolvedValue(question) },
      })),
    };
    service = new HtmlGameQuestionsService(prisma);
  });

  it('creates a validated master question for a configurable game', async () => {
    const result = await service.create('game-1', {
      order: 1,
      question: '  Thủ đô Việt Nam? ',
      type: HtmlGameQuestionType.SINGLE_CHOICE,
      options: ['Hà Nội', 'Huế'],
      correctAnswer: 'Hà Nội',
    });
    expect(result).toBe(question);
    expect(prisma.htmlGameQuestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ htmlGameId: 'game-1', question: 'Thủ đô Việt Nam?' }),
    });
  });

  it('rejects question editing for legacy games', async () => {
    prisma.htmlGame.findUnique.mockResolvedValue({ ...game, supportsQuestionConfig: false });
    await expect(service.list('game-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects invalid correct answers', async () => {
    await expect(service.create('game-1', {
      order: 1,
      question: 'Chọn đáp án',
      type: HtmlGameQuestionType.SINGLE_CHOICE,
      options: ['A', 'B'],
      correctAnswer: 'C',
    })).rejects.toThrow(BadRequestException);
  });

  it('does not update a question belonging to another master game', async () => {
    prisma.htmlGameQuestion.findUnique.mockResolvedValue({ ...question, htmlGameId: 'game-2' });
    await expect(service.update('game-1', question.id, { question: 'Hack' })).rejects.toThrow(NotFoundException);
  });

  it('validates the complete set before reordering', async () => {
    await expect(service.reorder('game-1', { questionIds: [] })).rejects.toThrow(BadRequestException);
  });
});
