import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import JSZip = require('jszip');
import { HtmlGamePackageService } from './html-game-package.service';

describe('HtmlGamePackageService', () => {
  const config = {
    get: jest.fn(),
  } as unknown as ConfigService;
  let service: HtmlGamePackageService;

  beforeEach(() => {
    jest.clearAllMocks();
    (config.get as jest.Mock).mockReset();
    service = new HtmlGamePackageService(config);
  });

  const upload = (name: string, buffer: Buffer): Express.Multer.File =>
    ({ originalname: name, buffer, size: buffer.length } as Express.Multer.File);

  it('normalizes a standalone HTML file to the root entry file', async () => {
    const result = await service.parse(upload('lesson-game.html', Buffer.from('<h1>Game</h1>')));

    expect(result.files).toHaveLength(2);
    expect(result.files.find((item) => item.relativePath === 'index.html')).toMatchObject({
      relativePath: 'index.html',
      contentType: 'text/html; charset=utf-8',
    });
    expect(result.files.map((item) => item.relativePath)).toContain('teachflow-game-runtime.js');
  });

  it('rejects an HTML extension with an executable MIME', async () => {
    const file = upload('lesson-game.html', Buffer.from('<h1>Game</h1>'));
    file.mimetype = 'application/x-msdownload';
    await expect(service.parse(file)).rejects.toThrow('MIME');
  });

  it('accepts a ZIP with a root index and safe relative assets', async () => {
    const zip = new JSZip();
    zip.file('index.html', '<script src="assets/game.js"></script>');
    zip.file('assets/game.js', 'document.body.dataset.ready = "true";');

    const result = await service.parse(upload('game.zip', await zip.generateAsync({ type: 'nodebuffer' })));

    expect(result.files.map((item) => item.relativePath).sort()).toEqual([
      'assets/game.js',
      'index.html',
      'teachflow-game-runtime.js',
    ]);
  });

  it('rejects ZIP traversal paths', async () => {
    const zip = new JSZip();
    zip.file('index.html', '<h1>Game</h1>');
    zip.file('../outside.js', 'alert(1)');

    await expect(
      service.parse(upload('unsafe.zip', await zip.generateAsync({ type: 'nodebuffer' }))),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects packages without a root index.html', async () => {
    const zip = new JSZip();
    zip.file('nested/index.html', '<h1>Nested</h1>');

    await expect(
      service.parse(upload('nested.zip', await zip.generateAsync({ type: 'nodebuffer' }))),
    ).rejects.toThrow('index.html');
  });

  it('rejects extracted content above the configured limit', async () => {
    (config.get as jest.Mock).mockImplementation((key: string) =>
      key === 'HTML_GAME_MAX_EXTRACTED_MB' ? '0.000001' : undefined,
    );
    const zip = new JSZip();
    zip.file('index.html', '<h1>This content is larger than one byte</h1>');

    await expect(
      service.parse(upload('large.zip', await zip.generateAsync({ type: 'nodebuffer' }))),
    ).rejects.toThrow(PayloadTooLargeException);
  });

  it('parses pasted HTML as index.html without storing source in PostgreSQL', () => {
    const result = service.parseSource('<!doctype html><title>Game</title>');
    expect(result.files[0]).toMatchObject({ relativePath: 'index.html' });
    expect(result.files[0].body.toString('utf8')).toContain('<title>Game</title>');
    expect(result.files[0].body.toString('utf8')).toContain('data-teachflow-runtime="1"');
    expect(result.files.map((item) => item.relativePath)).toContain('teachflow-game-runtime.js');
  });

  it('rewrites a configured external runtime reference to the trusted package runtime', () => {
    const result = service.parseSource(
      '<!doctype html><script src="https://api.example/api/html-games/runtime/teachflow-game-runtime.js"></script>',
    );
    const html = result.files.find((item) => item.relativePath === 'index.html')!.body.toString('utf8');
    expect(html).toContain('src="./teachflow-game-runtime.js"');
    expect(html).not.toContain('https://api.example');
  });

  it('rejects oversized pasted HTML', () => {
    expect(() => service.parseSource('x'.repeat(2 * 1024 * 1024 + 1))).toThrow(PayloadTooLargeException);
  });
});
