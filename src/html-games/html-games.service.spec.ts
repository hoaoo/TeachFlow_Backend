import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { HtmlGameStatus } from '@prisma/client';
import { HtmlGamesService } from './html-games.service';

describe('HtmlGamesService', () => {
  let service: HtmlGamesService;
  let prisma: any;
  let storage: any;
  let packages: any;

  const admin = { userId: 'admin-1', email: 'admin@example.com', role: 'ADMIN' };
  const teacher = {
    userId: 'user-teacher-1',
    email: 'teacher@example.com',
    role: 'TEACHER',
    teacherId: 'teacher-1',
  };
  const game = {
    id: 'game-1',
    title: 'Phép cộng vui',
    description: null,
    thumbnail: null,
    gradeId: null,
    subjectId: null,
    storagePrefix: 'games/game-1/package-current',
    entryFile: 'index.html',
    status: HtmlGameStatus.PUBLISHED,
    supportsQuestionConfig: false,
    configSchemaVersion: null,
    questions: [],
    createdById: 'admin-1',
    createdBy: { id: 'admin-1', email: 'admin@example.com' },
    grade: null,
    subject: null,
    createdAt: new Date('2026-08-29T00:00:00Z'),
    updatedAt: new Date('2026-08-29T00:00:00Z'),
  };

  beforeEach(() => {
    prisma = {
      htmlGame: {
        findMany: jest.fn().mockResolvedValue([game]),
        findUnique: jest.fn().mockResolvedValue(game),
        create: jest.fn().mockResolvedValue(game),
        update: jest.fn().mockResolvedValue(game),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        delete: jest.fn().mockResolvedValue(game),
      },
      grade: { findUnique: jest.fn() },
      subject: { findUnique: jest.fn() },
      teacherHtmlGame: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    storage = {
      objectExists: jest.fn().mockResolvedValue(true),
      getPublicUrl: jest.fn().mockReturnValue('https://games.example/games/game-1/index.html'),
      putObject: jest.fn().mockResolvedValue(undefined),
      deletePrefix: jest.fn().mockResolvedValue(undefined),
    };
    packages = {
      parse: jest.fn().mockResolvedValue({
        files: [
          { relativePath: 'index.html', body: Buffer.from('<h1>Game</h1>'), contentType: 'text/html' },
        ],
        totalSize: 13,
      }),
      parseSource: jest.fn().mockReturnValue({
        files: [
          { relativePath: 'index.html', body: Buffer.from('<h1>Source</h1>'), contentType: 'text/html' },
        ],
        totalSize: 15,
      }),
    };
    service = new HtmlGamesService(prisma, storage, packages);
  });

  it('always scopes a teacher list to published games', async () => {
    await service.findAll({ status: HtmlGameStatus.DRAFT }, teacher);

    expect(prisma.htmlGame.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: HtmlGameStatus.PUBLISHED } }),
    );
  });

  it('hides draft game details from teachers', async () => {
    prisma.htmlGame.findUnique.mockResolvedValue({ ...game, status: HtmlGameStatus.DRAFT });

    await expect(service.findOne(game.id, teacher)).rejects.toThrow(NotFoundException);
  });

  it('returns only sandboxed play metadata', async () => {
    const result = await service.getPlay(game.id, teacher);

    expect(result).toEqual({
      id: game.id,
      title: game.title,
      playUrl: 'https://games.example/games/game-1/index.html',
      sandbox: 'allow-scripts allow-forms allow-pointer-lock',
      referrerPolicy: 'no-referrer',
      supportsQuestionConfig: false,
      configSchemaVersion: null,
      questions: [],
    });
  });

  it.each([HtmlGameStatus.DRAFT, HtmlGameStatus.DISABLED])(
    'does not let a teacher play a %s game',
    async (status) => {
      prisma.htmlGame.findUnique.mockResolvedValue({ ...game, status });
      await expect(service.getPlay(game.id, teacher)).rejects.toThrow(NotFoundException);
    },
  );

  it('stores pasted HTML through the same staged object-storage path', async () => {
    prisma.htmlGame.findUnique
      .mockResolvedValueOnce(game)
      .mockResolvedValueOnce({ ...game, storagePrefix: 'games/game-1/package-source' });

    const result = await service.uploadSource(game.id, { html: '<h1>Source</h1>' });

    expect(packages.parseSource).toHaveBeenCalledWith('<h1>Source</h1>');
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ key: expect.stringMatching(/\/index\.html$/) }),
    );
    expect(result.package.fileCount).toBe(1);
  });

  it('refuses publication until the entry object exists', async () => {
    storage.objectExists.mockResolvedValue(false);

    await expect(
      service.updateStatus(game.id, { status: HtmlGameStatus.PUBLISHED }),
    ).rejects.toThrow(BadRequestException);
  });

  it('uploads to a staged prefix, swaps metadata, then removes the old package', async () => {
    prisma.htmlGame.findUnique
      .mockResolvedValueOnce(game)
      .mockResolvedValueOnce({ ...game, storagePrefix: 'games/game-1/package-next' });

    const result = await service.uploadPackage(
      game.id,
      { originalname: 'game.html', buffer: Buffer.from('html') } as Express.Multer.File,
    );

    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ key: expect.stringMatching(/^games\/game-1\/package-[^/]+\/index\.html$/) }),
    );
    expect(prisma.htmlGame.updateMany).toHaveBeenCalledWith({
      where: { id: game.id, storagePrefix: game.storagePrefix },
      data: {
        storagePrefix: expect.stringMatching(/^games\/game-1\/package-[^/]+$/),
        entryFile: 'index.html',
      },
    });
    expect(storage.deletePrefix).toHaveBeenCalledWith(game.storagePrefix);
    expect(result.package).toEqual({ fileCount: 1, totalSize: 13 });
  });

  it('cleans the staged package when a concurrent upload wins', async () => {
    prisma.htmlGame.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.uploadPackage(
        game.id,
        { originalname: 'game.html', buffer: Buffer.from('html') } as Express.Multer.File,
      ),
    ).rejects.toThrow(ConflictException);

    expect(storage.deletePrefix).toHaveBeenCalledWith(
      expect.stringMatching(/^games\/game-1\/package-[^/]+$/),
    );
  });

  it('deletes the full game namespace so orphaned packages are removed', async () => {
    await service.remove(game.id);

    expect(storage.deletePrefix).toHaveBeenCalledWith(`games/${game.id}`);
    expect(prisma.htmlGame.delete).toHaveBeenCalledWith({ where: { id: game.id } });
  });

  it('creates games under an isolated package namespace', async () => {
    await service.create({ title: 'Game mới' }, admin);

    expect(prisma.htmlGame.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storagePrefix: expect.stringMatching(/^games\/[^/]+\/package-initial$/),
          status: HtmlGameStatus.DRAFT,
        }),
      }),
    );
  });

  it('persists question-config capability and schema version on create', async () => {
    await service.create({
      title: 'Game configurable',
      supportsQuestionConfig: true,
      configSchemaVersion: 1,
    }, admin);

    expect(prisma.htmlGame.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supportsQuestionConfig: true,
          configSchemaVersion: 1,
        }),
      }),
    );
  });

  it('rejects a whitespace-only title as a validation error', async () => {
    await expect(service.create({ title: '   ' }, admin)).rejects.toThrow(BadRequestException);
    expect(prisma.htmlGame.create).not.toHaveBeenCalled();
  });
});
