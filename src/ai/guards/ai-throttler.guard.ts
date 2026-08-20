import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';

interface RateLimitRecord {
  timestamps: number[];
}

@Injectable()
export class AiThrottlerGuard implements CanActivate {
  private readonly logger = new Logger(AiThrottlerGuard.name);
  private readonly requests = new Map<string, RateLimitRecord>();
  private readonly WINDOW_MS = 60 * 1000; // 1 minute
  private readonly MAX_REQUESTS = 20; // 20 requests per minute per user

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId || request.ip || 'anonymous';
    const now = Date.now();

    let record = this.requests.get(userId);
    if (!record) {
      record = { timestamps: [] };
      this.requests.set(userId, record);
    }

    // Filter out timestamps older than the sliding window
    record.timestamps = record.timestamps.filter((time) => now - time < this.WINDOW_MS);

    if (record.timestamps.length >= this.MAX_REQUESTS) {
      this.logger.warn(`AI Rate limit exceeded for user: ${userId} (${record.timestamps.length}/${this.MAX_REQUESTS} in 1m)`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Bạn đã vượt quá giới hạn 20 yêu cầu AI mỗi phút. Vui lòng thử lại sau giây lát.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.timestamps.push(now);
    return true;
  }
}
