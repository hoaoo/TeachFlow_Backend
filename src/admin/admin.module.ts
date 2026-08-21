import { Module } from '@nestjs/common';
import { AdminTeachersController } from './admin-teachers.controller';
import { AdminTeachersService } from './admin-teachers.service';
import { AuditController } from './audit.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AdminTeachersController, AuditController],
  providers: [AdminTeachersService],
  exports: [AdminTeachersService],
})
export class AdminModule {}
