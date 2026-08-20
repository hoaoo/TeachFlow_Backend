import {
  Controller,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StudentCommentsService } from './student-comments.service';
import { CreateCommentDto, UpdateCommentDto } from './dto/create-comment.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Comments')
@ApiBearerAuth()
@Controller()
export class StudentCommentsController {
  constructor(private studentCommentsService: StudentCommentsService) {}

  @Post('students/:studentId/comments')
  @ApiOperation({ summary: 'Thêm nhận xét cho học sinh' })
  async createForStudent(
    @Param('studentId') studentId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentCommentsService.createForStudent(studentId, dto, user.teacherId);
  }

  @Patch('student-comments/:id')
  @ApiOperation({ summary: 'Chỉnh sửa nhận xét' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentCommentsService.update(id, dto, user.teacherId);
  }

  @Delete('student-comments/:id')
  @ApiOperation({ summary: 'Xóa nhận xét' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentCommentsService.remove(id, user.teacherId);
  }
}
