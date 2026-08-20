import { Module } from '@nestjs/common';
import { StudentCommentsController } from './student-comments.controller';
import { StudentCommentsService } from './student-comments.service';

@Module({
  controllers: [StudentCommentsController],
  providers: [StudentCommentsService],
  exports: [StudentCommentsService],
})
export class StudentCommentsModule {}
