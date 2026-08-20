import { Module } from '@nestjs/common';
import { AdminTeachersController } from './admin-teachers.controller';
import { AdminTeachersService } from './admin-teachers.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AdminTeachersController],
  providers: [AdminTeachersService],
  exports: [AdminTeachersService],
})
export class AdminModule {}
