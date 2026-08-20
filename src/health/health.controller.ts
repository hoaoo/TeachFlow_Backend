import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { HealthService, HealthCheckResponse } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'Kiểm tra trạng thái hoạt động của hệ thống và cơ sở dữ liệu' })
  @ApiResponse({
    status: 200,
    description: 'Hệ thống và cơ sở dữ liệu hoạt động bình thường',
    schema: {
      example: {
        status: 'ok',
        database: 'up',
        timestamp: '2026-08-20T15:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Cơ sở dữ liệu không khả dụng hoặc mất kết nối',
    schema: {
      example: {
        status: 'error',
        database: 'down',
        timestamp: '2026-08-20T15:00:00.000Z',
      },
    },
  })
  async check(): Promise<HealthCheckResponse> {
    return await this.healthService.checkHealth();
  }
}
