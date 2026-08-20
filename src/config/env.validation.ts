import { Logger } from '@nestjs/common';

const INSECURE_SECRET_PLACEHOLDERS = [
  'change-me',
  'your_jwt_access_secret',
  'your_jwt_refresh_secret',
  'teachflow_jwt_access_super_secret_key_2026',
  'teachflow_jwt_refresh_super_secret_key_2026',
  'default_secret',
  'default_jwt_secret',
  'placeholder',
];

export interface ValidatedEnvironment {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  FRONTEND_URL: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  RESOURCE_UPLOAD_DIR: string;
  RESOURCE_MAX_FILE_SIZE_MB: number;
}

export function validateEnvironment(): ValidatedEnvironment {
  const logger = new Logger('EnvValidation');
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';

  const port = parseInt(process.env.PORT || '3001', 10);
  const databaseUrl = process.env.DATABASE_URL || '';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const accessSecret = process.env.JWT_ACCESS_SECRET || '';
  const refreshSecret = process.env.JWT_REFRESH_SECRET || '';

  if (isProd) {
    if (!databaseUrl || databaseUrl.trim() === '') {
      throw new Error('Startup validation failed: Missing required environment variable: DATABASE_URL');
    }

    if (!accessSecret || accessSecret.trim() === '') {
      throw new Error('Startup validation failed: Missing required environment variable: JWT_ACCESS_SECRET');
    }

    if (!refreshSecret || refreshSecret.trim() === '') {
      throw new Error('Startup validation failed: Missing required environment variable: JWT_REFRESH_SECRET');
    }

    if (accessSecret.length < 32) {
      throw new Error('Startup validation failed: JWT_ACCESS_SECRET must be at least 32 characters in production');
    }

    if (refreshSecret.length < 32) {
      throw new Error('Startup validation failed: JWT_REFRESH_SECRET must be at least 32 characters in production');
    }

    const lowerAccess = accessSecret.toLowerCase();
    const lowerRefresh = refreshSecret.toLowerCase();

    for (const placeholder of INSECURE_SECRET_PLACEHOLDERS) {
      if (lowerAccess.includes(placeholder)) {
        throw new Error('Startup validation failed: Insecure placeholder detected in JWT_ACCESS_SECRET');
      }
      if (lowerRefresh.includes(placeholder)) {
        throw new Error('Startup validation failed: Insecure placeholder detected in JWT_REFRESH_SECRET');
      }
    }

    if (accessSecret === refreshSecret) {
      throw new Error('Startup validation failed: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must not be identical');
    }
  }

  // Safe development fallback secrets for local non-prod testing only
  const finalAccessSecret =
    accessSecret || (isProd ? '' : 'dev_local_access_secret_only_for_testing_1234567890');
  const finalRefreshSecret =
    refreshSecret || (isProd ? '' : 'dev_local_refresh_secret_only_for_testing_1234567890');

  logger.log(`Environment validated for mode: ${nodeEnv}`);

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: databaseUrl,
    FRONTEND_URL: frontendUrl,
    JWT_ACCESS_SECRET: finalAccessSecret,
    JWT_REFRESH_SECRET: finalRefreshSecret,
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    JWT_ISSUER: process.env.JWT_ISSUER || 'teachflow-backend',
    JWT_AUDIENCE: process.env.JWT_AUDIENCE || 'teachflow-frontend',
    RESOURCE_UPLOAD_DIR: process.env.RESOURCE_UPLOAD_DIR || 'uploads/resources',
    RESOURCE_MAX_FILE_SIZE_MB: parseInt(process.env.RESOURCE_MAX_FILE_SIZE_MB || '25', 10),
  };
}
