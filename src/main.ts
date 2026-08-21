import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { validateEnvironment } from './config/env.validation';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // 1. Validate Environment on startup (fail-fast in production)
  const env = validateEnvironment();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const port = Number(
    process.env.PORT ??
    configService.get<string>('PORT') ??
    3001,
  );
  const nodeEnv = env.NODE_ENV;
  const isProd = nodeEnv === 'production';

  // 2. Trust Proxy for reverse proxy deployment (accurate client IP for throttling & logs)
  app.set('trust proxy', 1);

  // 3. Graceful Shutdown Hooks
  app.enableShutdownHooks();

  // 4. Security Headers (Helmet)
  app.use(
    helmet({
      contentSecurityPolicy: false, // Keep Swagger UI and Next.js frontend assets working
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: isProd
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
    }),
  );

  // 5. Cookie parser middleware
  app.use(cookieParser());

  // 6. Global prefix
  app.setGlobalPrefix('api');

  // 7. CORS Configuration (Strict origin allowlist in production)
  const configuredFrontendUrls = (configService.get<string>('FRONTEND_URL') || env.FRONTEND_URL)
    .split(',')
    .map((url) => url.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const allowedOrigins = isProd
    ? configuredFrontendUrls
    : Array.from(new Set([...configuredFrontendUrls, 'http://localhost:3000', 'http://127.0.0.1:3000']));

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, curl, healthcheck)
      if (!origin) {
        return callback(null, true);
      }
      const normalizedOrigin = origin.replace(/\/$/, '');
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS Error: Origin ${origin} is not allowed by CORS policy`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Forwarded-For'],
  });

  // 8. Global ValidationPipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // 9. Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('TeachFlow API')
    .setDescription('Hệ thống API RESTful cho trợ lý giáo viên TeachFlow')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Nhập JWT access token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port, '0.0.0.0');
  logger.log(`TeachFlow Backend running in ${nodeEnv} mode on port ${port}`);
  logger.log('Swagger OpenAPI Documentation: /api/docs');
  logger.log('Healthcheck endpoint: /api/health');
}
bootstrap();
