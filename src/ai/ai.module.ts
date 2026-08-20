import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiThrottlerGuard } from './guards/ai-throttler.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AiController],
  providers: [AiService, AiThrottlerGuard],
  exports: [AiService],
})
export class AiModule {}
