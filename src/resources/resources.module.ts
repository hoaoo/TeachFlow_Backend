import { Module } from '@nestjs/common';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';
import { StorageService } from './storage/storage.service';
import { PreviewService } from './preview.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ResourcesController],
  providers: [ResourcesService, StorageService, PreviewService],
  exports: [ResourcesService, StorageService, PreviewService],
})
export class ResourcesModule {}
