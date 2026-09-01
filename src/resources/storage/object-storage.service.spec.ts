import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectStorageService } from './object-storage.service';

describe('ObjectStorageService public game URLs', () => {
  const create = (values: Record<string, string | undefined>) =>
    new ObjectStorageService({
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService);

  it('encodes every safe object-key segment', () => {
    const service = create({ OBJECT_STORAGE_PUBLIC_BASE_URL: 'https://games.example.edu/base/' });

    expect(service.getPublicUrl('games/game-1/assets/file name.js')).toBe(
      'https://games.example.edu/base/games/game-1/assets/file%20name.js',
    );
  });

  it('rejects unsafe object keys before building a URL', () => {
    const service = create({ OBJECT_STORAGE_PUBLIC_BASE_URL: 'https://games.example.edu' });

    expect(() => service.getPublicUrl('games/../secret')).toThrow(InternalServerErrorException);
  });

  it('requires a separate HTTPS game origin in production', () => {
    const insecure = create({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://app.example.edu',
      OBJECT_STORAGE_PUBLIC_BASE_URL: 'http://games.example.edu',
    });
    const sameOrigin = create({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://app.example.edu',
      OBJECT_STORAGE_PUBLIC_BASE_URL: 'https://app.example.edu/games',
    });

    expect(() => insecure.getPublicUrl('games/game-1/index.html')).toThrow('HTTPS');
    expect(() => sameOrigin.getPublicUrl('games/game-1/index.html')).toThrow('tách biệt');
  });

  it('falls back to local public URL when S3 is not configured in dev', () => {
    const devService = create({
      NODE_ENV: 'development',
      API_BASE_URL: 'http://localhost:3001',
    });

    expect(devService.getPublicUrl('games/game-1/package-123/index.html')).toBe(
      'http://localhost:3001/api/html-games/public/games/game-1/package-123/index.html',
    );
  });

  it('supports local disk put, exists, getStream, and deletePrefix', async () => {
    const devService = create({
      NODE_ENV: 'development',
      RESOURCE_UPLOAD_DIR: 'uploads/test-resources',
    });

    const key = `test-game-${Date.now()}/index.html`;
    await devService.putObject({
      key,
      body: Buffer.from('<!doctype html><h1>Test</h1>'),
      contentType: 'text/html; charset=utf-8',
    });

    expect(await devService.objectExists(key)).toBe(true);

    const streamInfo = await devService.getLocalFileStream(key);
    expect(streamInfo.contentType).toBe('text/html; charset=utf-8');
    expect(streamInfo.size).toBeGreaterThan(0);

    const prefix = key.split('/')[0];
    await devService.deletePrefix(prefix);
    expect(await devService.objectExists(key)).toBe(false);
  });
});
