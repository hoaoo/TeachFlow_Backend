import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import {
  getAllowedCorsOrigins,
  getCorsOptions,
  TAURI_WINDOWS_ORIGIN,
  WEB_PRODUCTION_ORIGIN,
} from './cors.config';

describe('getAllowedCorsOrigins', () => {
  it('allows only the configured web origin and Windows Tauri origin by default in production', () => {
    expect(getAllowedCorsOrigins(true)).toEqual([
      WEB_PRODUCTION_ORIGIN,
      TAURI_WINDOWS_ORIGIN,
    ]);
  });

  it('keeps localhost origins for development and never adds a wildcard', () => {
    const origins = getAllowedCorsOrigins(false);

    expect(origins).toContain('http://localhost:3000');
    expect(origins).toContain('http://127.0.0.1:3000');
    expect(origins).toContain(TAURI_WINDOWS_ORIGIN);
    expect(origins).not.toContain('*');
  });

  it('normalizes configured origins and removes duplicates', () => {
    expect(
      getAllowedCorsOrigins(true, `${WEB_PRODUCTION_ORIGIN}/,https://school.example.com/`),
    ).toEqual([
      WEB_PRODUCTION_ORIGIN,
      TAURI_WINDOWS_ORIGIN,
      'https://school.example.com',
    ]);
  });

  it('accepts the Windows Tauri origin with credentialed CORS semantics', (done) => {
    const options = getCorsOptions(true);
    const origin = options.origin;

    expect(options.credentials).toBe(true);
    expect(origin).toEqual(expect.any(Function));
    if (typeof origin !== 'function') {
      return done.fail('Expected a CORS origin callback');
    }

    origin(TAURI_WINDOWS_ORIGIN, (error, allowed) => {
      expect(error).toBeNull();
      expect(allowed).toBe(true);
      done();
    });
  });

  it('rejects origins outside the explicit allowlist', (done) => {
    const options = getCorsOptions(true);
    const origin = options.origin;

    if (typeof origin !== 'function') {
      return done.fail('Expected a CORS origin callback');
    }

    origin('https://untrusted.example.com', (error, allowed) => {
      expect(error).toBeInstanceOf(Error);
      expect(allowed).toBe(false);
      done();
    });
  });

  it('returns the credentialed CORS headers for an OPTIONS login preflight', async () => {
    const moduleRef = await Test.createTestingModule({}).compile();
    const app: INestApplication = moduleRef.createNestApplication();

    app.setGlobalPrefix('api');
    app.enableCors(getCorsOptions(true));
    await app.init();

    try {
      const response = await request(app.getHttpServer())
        .options('/api/auth/login')
        .set('Origin', TAURI_WINDOWS_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe(TAURI_WINDOWS_ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
    } finally {
      await app.close();
    }
  });
});
