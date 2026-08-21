import { Module, Global } from '@nestjs/common';
import { TeachingAssignmentAuthorizationService } from './services/teaching-assignment-authorization.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [TeachingAssignmentAuthorizationService],
  exports: [TeachingAssignmentAuthorizationService],
})
export class CommonModule {}
