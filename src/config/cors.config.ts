import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export const TAURI_WINDOWS_ORIGIN = 'http://tauri.localhost';
export const TAURI_DEV_ORIGIN = 'http://localhost:3000';
export const WEB_PRODUCTION_ORIGIN = 'https://teachflow-fontend.onrender.com';

export function getAllowedCorsOrigins(isProd: boolean, rawFrontendUrls = ''): string[] {
  const configuredFrontendUrls = rawFrontendUrls
    .split(',')
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const defaultOrigins = isProd
    ? [WEB_PRODUCTION_ORIGIN, TAURI_WINDOWS_ORIGIN, TAURI_DEV_ORIGIN]
    : [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        WEB_PRODUCTION_ORIGIN,
        TAURI_WINDOWS_ORIGIN,
      ];

  return Array.from(new Set([...defaultOrigins, ...configuredFrontendUrls]));
}

export function getCorsOptions(
  isProd: boolean,
  rawFrontendUrls = '',
  warn: (message: string) => void = () => undefined,
): CorsOptions {
  const allowedOrigins = getAllowedCorsOrigins(isProd, rawFrontendUrls);

  return {
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      const normalizedOrigin = origin.replace(/\/+$/, '');
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }
      warn(`CORS rejected origin: "${origin}". Allowed origins: ${JSON.stringify(allowedOrigins)}`);
      return callback(new Error(`CORS Error: Origin ${origin} is not allowed by CORS policy`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Forwarded-For'],
  };
}
