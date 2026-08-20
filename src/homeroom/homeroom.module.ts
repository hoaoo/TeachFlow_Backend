import { Module } from '@nestjs/common';
import { HomeroomController } from './homeroom.controller';
import { HomeroomService } from './homeroom.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ExportModule } from '../export/export.module';

@Module({
  imports: [PrismaModule, ExportModule],
  controllers: [HomeroomController],
  providers: [HomeroomService],
  exports: [HomeroomService],
})
export class HomeroomModule {}
