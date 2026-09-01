import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HtmlGameStatus } from '@prisma/client';
import JSZip = require('jszip');
import { ObjectStorageService } from '../resources/storage/object-storage.service';
import { HtmlGamePackageService } from './html-game-package.service';
import { HtmlGamesService } from './html-games.service';

describe('HtmlGame End-to-End Workflow', () => {
  let config: ConfigService;
  let objectStorage: ObjectStorageService;
  let packageService: HtmlGamePackageService;
  let service: HtmlGamesService;
  let prisma: any;
  const gamesDb = new Map<string, any>();

  const admin = { userId: 'admin-1', email: 'admin@example.com', role: 'ADMIN' };
  const teacher = {
    userId: 'teacher-user-1',
    email: 'teacher@example.com',
    role: 'TEACHER',
    teacherId: 'teacher-1',
  };

  beforeEach(() => {
    gamesDb.clear();
    config = new ConfigService({
      NODE_ENV: 'development',
      RESOURCE_UPLOAD_DIR: 'uploads/test-resources',
      API_BASE_URL: 'http://localhost:3001',
    });

    objectStorage = new ObjectStorageService(config);
    packageService = new HtmlGamePackageService(config);

    prisma = {
      htmlGame: {
        findMany: jest.fn(async () => Array.from(gamesDb.values())),
        findUnique: jest.fn(async ({ where }: any) => gamesDb.get(where.id) || null),
        create: jest.fn(async ({ data }: any) => {
          const game = {
            id: data.id,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            questions: [],
            grade: null,
            subject: null,
            createdBy: { id: data.createdById || 'admin-1', email: 'admin@example.com' },
          };
          gamesDb.set(data.id, game);
          return game;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const existing = gamesDb.get(where.id);
          if (!existing) throw new NotFoundException('Game not found');
          const updated = { ...existing, ...data, updatedAt: new Date() };
          gamesDb.set(where.id, updated);
          return updated;
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const existing = gamesDb.get(where.id);
          if (existing && (!where.storagePrefix || existing.storagePrefix === where.storagePrefix)) {
            const updated = { ...existing, ...data, updatedAt: new Date() };
            gamesDb.set(where.id, updated);
            return { count: 1 };
          }
          return { count: 0 };
        }),
        delete: jest.fn(async ({ where }: any) => {
          const existing = gamesDb.get(where.id);
          gamesDb.delete(where.id);
          return existing;
        }),
      },
      grade: { findUnique: jest.fn() },
      subject: { findUnique: jest.fn() },
      teacher: { findUnique: jest.fn() },
      teacherHtmlGame: {
        findMany: jest.fn(async () => []),
        findUnique: jest.fn(async () => null),
      },
    };

    service = new HtmlGamesService(prisma, objectStorage, packageService);
  });

  it('completes the full "Dán mã" workflow from creation to play without storage errors', async () => {
    // 1. Admin creates draft
    const created = await service.create({
      title: 'Trò chơi trắc nghiệm HTML',
      description: 'Dán mã trực tiếp từ file HTML hoàn chỉnh',
    }, admin);

    expect(created.status).toBe(HtmlGameStatus.DRAFT);
    expect(created.entryFile).toBe('index.html');

    // 2. Admin pastes complete HTML
    const completeHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Trò chơi câu đố</title>
  <style>body { background: #e0f2fe; text-align: center; }</style>
</head>
<body>
  <h1>Câu hỏi 1: Thủ đô của Việt Nam là gì?</h1>
  <button>Hà Nội</button>
</body>
</html>`;

    const updated = await service.uploadSource(created.id, { html: completeHtml });
    expect(updated.entryFile).toBe('index.html');
    expect(updated.package).toBeDefined();
    expect(updated.package?.fileCount).toBe(2); // index.html + teachflow-game-runtime.js

    // 3. Admin previews play
    const playInfo = await service.getPlay(created.id, admin);
    expect(playInfo.id).toBe(created.id);
    expect(playInfo.title).toBe(created.title);
    expect(playInfo.playUrl).toContain('/api/html-games/public/');
    expect(playInfo.sandbox).toContain('allow-scripts');

    // 4. Admin publishes game
    const published = await service.updateStatus(created.id, { status: HtmlGameStatus.PUBLISHED });
    expect(published.status).toBe(HtmlGameStatus.PUBLISHED);

    // 5. Teacher can now play published game
    const teacherPlay = await service.getPlay(created.id, teacher);
    expect(teacherPlay.playUrl).toBe(playInfo.playUrl);

    // 6. Cleanup
    const finalPrefix = gamesDb.get(created.id)?.storagePrefix;
    await service.remove(created.id);
    expect(await objectStorage.objectExists(`${finalPrefix}/index.html`)).toBe(false);
  });

  it('supports single .html file upload', async () => {
    const created = await service.create({ title: 'Single HTML File Game' }, admin);

    const file = {
      originalname: 'game.html',
      mimetype: 'text/html',
      buffer: Buffer.from('<!doctype html><h1>Game</h1>'),
      size: 28,
    } as Express.Multer.File;

    const uploaded = await service.uploadPackage(created.id, file);
    expect(uploaded.entryFile).toBe('index.html');
    expect(uploaded.package?.fileCount).toBe(2);

    const play = await service.getPlay(created.id, admin);
    expect(play.playUrl).toContain('/api/html-games/public/');
  });

  it('supports ZIP package upload with assets', async () => {
    const created = await service.create({ title: 'ZIP Package Game' }, admin);

    const zip = new JSZip();
    zip.file('index.html', '<!doctype html><script src="js/main.js"></script>');
    zip.file('js/main.js', 'console.log("ready");');
    zip.file('css/style.css', 'body { color: red; }');

    const file = {
      originalname: 'game.zip',
      mimetype: 'application/zip',
      buffer: await zip.generateAsync({ type: 'nodebuffer' }),
      size: 500,
    } as Express.Multer.File;

    const uploaded = await service.uploadPackage(created.id, file);
    expect(uploaded.package?.fileCount).toBe(4); // index.html, main.js, style.css, teachflow-game-runtime.js
  });

  it('rejects ZIP package without index.html at root', async () => {
    const created = await service.create({ title: 'Invalid ZIP Game' }, admin);

    const zip = new JSZip();
    zip.file('nested/index.html', '<h1>Nested</h1>');

    const file = {
      originalname: 'game.zip',
      mimetype: 'application/zip',
      buffer: await zip.generateAsync({ type: 'nodebuffer' }),
      size: 500,
    } as Express.Multer.File;

    await expect(service.uploadPackage(created.id, file)).rejects.toThrow(BadRequestException);
  });

  it('rejects ZIP path traversal', async () => {
    const created = await service.create({ title: 'Traversal ZIP Game' }, admin);

    const zip = new JSZip();
    zip.file('index.html', '<h1>Game</h1>');
    zip.file('../evil.js', 'alert(1)');

    const file = {
      originalname: 'game.zip',
      mimetype: 'application/zip',
      buffer: await zip.generateAsync({ type: 'nodebuffer' }),
      size: 500,
    } as Express.Multer.File;

    await expect(service.uploadPackage(created.id, file)).rejects.toThrow(BadRequestException);
  });

  it('cleans up staged storage objects if DB persistence fails', async () => {
    const created = await service.create({ title: 'DB Fail Game' }, admin);

    // Mock updateMany failure (conflict)
    prisma.htmlGame.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.uploadSource(created.id, { html: '<h1>Test</h1>' }),
    ).rejects.toThrow(ConflictException);
  });

  it('does not require question configuration metadata for legacy games', async () => {
    const legacy = await service.create({
      title: 'Legacy Game',
      supportsQuestionConfig: false,
    }, admin);

    expect(legacy.supportsQuestionConfig).toBe(false);
    expect(legacy.configSchemaVersion).toBeNull();
  });
});
