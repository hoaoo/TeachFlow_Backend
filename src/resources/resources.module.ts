import { Module } from '@nestjs/common';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';
import { StorageService } from './storage/storage.service';
import { ObjectStorageService } from './storage/object-storage.service';
import { PreviewService } from './preview.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ResourcesController],
  providers: [ResourcesService, StorageService, ObjectStorageService, PreviewService],
  exports: [ResourcesService, StorageService, ObjectStorageService, PreviewService],
})
export class ResourcesModule {}
