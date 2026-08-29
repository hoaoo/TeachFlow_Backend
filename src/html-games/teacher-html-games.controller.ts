import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CreateHtmlGameQuestionDto,
  ReorderHtmlGameQuestionsDto,
  UpdateHtmlGameQuestionDto,
  UpdateTeacherHtmlGameDto,
} from './dto/html-game-question.dto';
import { TeacherHtmlGamesService } from './teacher-html-games.service';

@ApiTags('Teacher HTML Game Customizations')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('TEACHER')
@Controller('html-game-customizations')
export class TeacherHtmlGamesController {
  constructor(private readonly customizations: TeacherHtmlGamesService) {}

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.customizations.get(id, user.teacherId);
  }

  @Get(':id/play')
  play(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.customizations.getPlay(id, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTeacherHtmlGameDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customizations.update(id, dto, user.teacherId);
  }

  @Post(':id/questions')
  createQuestion(
    @Param('id') id: string,
    @Body() dto: CreateHtmlGameQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customizations.createQuestion(id, dto, user.teacherId);
  }

  @Patch(':id/questions/:questionId')
  updateQuestion(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateHtmlGameQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customizations.updateQuestion(id, questionId, dto, user.teacherId);
  }

  @Delete(':id/questions/:questionId')
  removeQuestion(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customizations.removeQuestion(id, questionId, user.teacherId);
  }

  @Put(':id/questions/reorder')
  reorder(
    @Param('id') id: string,
    @Body() dto: ReorderHtmlGameQuestionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customizations.reorder(id, dto, user.teacherId);
  }
}
