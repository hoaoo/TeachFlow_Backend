import { Module, Global } from '@nestjs/common';
import { TeachingAssignmentAuthorizationService } from './services/teaching-assignment-authorization.service';
import { AuditService } from './audit/audit.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [TeachingAssignmentAuthorizationService, AuditService],
  exports: [TeachingAssignmentAuthorizationService, AuditService],
})
export class CommonModule {}
