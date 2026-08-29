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
});
