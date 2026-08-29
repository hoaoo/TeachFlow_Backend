import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { HtmlGameQuestionType, HtmlGameStatus } from '@prisma/client';
import { TeacherHtmlGamesService } from './teacher-html-games.service';

describe('TeacherHtmlGamesService ownership and cloning', () => {
  let prisma: any;
  let htmlGames: any;
  let service: TeacherHtmlGamesService;
  const masterQuestion = {
    id: 'master-q-1',
    htmlGameId: 'game-1',
    order: 0,
    question: '2 + 2 = ?',
    type: HtmlGameQuestionType.SINGLE_CHOICE,
    options: ['3', '4'],
    correctAnswer: '4',
    explanation: null,
    metadata: null,
  };
  const customization = {
    id: 'custom-1',
    htmlGameId: 'game-1',
    teacherId: 'teacher-1',
    title: null,
    htmlGame: {
      id: 'game-1',
      title: 'Phép cộng vui',
      status: HtmlGameStatus.PUBLISHED,
      supportsQuestionConfig: true,
    },
    questions: [{ ...masterQuestion, id: 'teacher-q-1', teacherHtmlGameId: 'custom-1' }],
  };

  beforeEach(() => {
    prisma = {
      htmlGame: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'game-1',
          status: HtmlGameStatus.PUBLISHED,
          supportsQuestionConfig: true,
          questions: [masterQuestion],
        }),
      },
      teacherHtmlGame: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(customization),
      },
      teacherHtmlGameQuestion: {
        findUnique: jest.fn().mockResolvedValue({
          ...customization.questions[0],
          teacherHtmlGame: {
            id: 'custom-1',
            teacherId: 'teacher-1',
            htmlGame: customization.htmlGame,
          },
        }),
        create: jest.fn().mockResolvedValue(customization.questions[0]),
        update: jest.fn().mockResolvedValue(customization.questions[0]),
        delete: jest.fn(),
        findMany: jest.fn().mockResolvedValue(customization.questions),
      },
      $transaction: jest.fn(async (callback: any) => callback({
        teacherHtmlGame: { create: jest.fn().mockResolvedValue(customization) },
        teacherHtmlGameQuestion: { update: jest.fn() },
      })),
    };
    htmlGames = {
      getPlay: jest.fn().mockResolvedValue({
        id: 'game-1',
        title: 'Phép cộng vui',
        playUrl: 'https://games.example/game-1/index.html',
        sandbox: 'allow-scripts',
        referrerPolicy: 'no-referrer',
        supportsQuestionConfig: true,
        configSchemaVersion: 1,
        questions: [masterQuestion],
      }),
    };
    service = new TeacherHtmlGamesService(prisma, htmlGames);
  });

  it('atomically clones master questions on first customization', async () => {
    const result = await service.createOrGet('game-1', 'teacher-1');
    expect(result).toBe(customization);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const createCall = (prisma.$transaction as jest.Mock).mock.calls[0][0];
    const txCreate = jest.fn().mockResolvedValue(customization);
    await createCall({ teacherHtmlGame: { create: txCreate } });
    expect(txCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        teacherId: 'teacher-1',
        htmlGameId: 'game-1',
        questions: { create: [expect.objectContaining({ question: masterQuestion.question })] },
      }),
    }));
  });

  it('returns the existing customization without cloning twice', async () => {
    prisma.teacherHtmlGame.findUnique.mockResolvedValue(customization);
    const result = await service.createOrGet('game-1', 'teacher-1');
    expect(result).toBe(customization);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lets a teacher update their own question', async () => {
    await service.updateQuestion('custom-1', 'teacher-q-1', { question: 'Câu hỏi mới' }, 'teacher-1');
    expect(prisma.teacherHtmlGameQuestion.update).toHaveBeenCalledWith({
      where: { id: 'teacher-q-1' },
      data: { question: 'Câu hỏi mới' },
    });
  });

  it('rejects reading another teacher customization (IDOR)', async () => {
    prisma.teacherHtmlGame.findUnique.mockResolvedValue(customization);
    await expect(service.get('custom-1', 'teacher-2')).rejects.toThrow(ForbiddenException);
  });

  it('rejects editing another teacher question even with a known question id (IDOR)', async () => {
    await expect(
      service.updateQuestion('custom-1', 'teacher-q-1', { question: 'Hack' }, 'teacher-2'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.teacherHtmlGameQuestion.update).not.toHaveBeenCalled();
  });

  it('does not expose a customization when its master is disabled', async () => {
    prisma.teacherHtmlGame.findUnique.mockResolvedValue({
      ...customization,
      htmlGame: { ...customization.htmlGame, status: HtmlGameStatus.DISABLED },
    });
    await expect(service.get('custom-1', 'teacher-1')).rejects.toThrow(NotFoundException);
  });
});
