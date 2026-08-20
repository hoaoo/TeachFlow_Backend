import { Injectable, Logger, HttpStatus, HttpException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  database: 'up' | 'down';
  timestamp: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async checkHealth(): Promise<HealthCheckResponse> {
    try {
      // Execute lightweight raw query to test database liveness
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        database: 'up',
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      this.logger.error(`Database health check failed: ${err?.message}`);

      throw new HttpException(
        {
          status: 'error',
          database: 'down',
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
