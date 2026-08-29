import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put,
  UploadedFile, UseGuards, UseInterceptors, ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateHtmlGameDto } from './dto/create-html-game.dto';
import { UpdateHtmlGameStatusDto } from './dto/update-html-game-status.dto';
import { UpdateHtmlGameDto } from './dto/update-html-game.dto';
import { DEFAULT_HTML_GAME_MAX_UPLOAD_BYTES } from './html-game.constants';
import { HtmlGamesService } from './html-games.service';
import { HtmlGameSourceDto } from './dto/html-game-source.dto';
import {
  CreateHtmlGameQuestionDto,
  ReorderHtmlGameQuestionsDto,
  UpdateHtmlGameQuestionDto,
} from './dto/html-game-question.dto';
import { HtmlGameQuestionsService } from './html-game-questions.service';

@ApiTags('Admin HTML Games')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/html-games')
export class AdminHtmlGamesController {
  constructor(
    private readonly games: HtmlGamesService,
    private readonly questions: HtmlGameQuestionsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Tạo metadata trò chơi HTML ở trạng thái nháp' })
  create(@Body() dto: CreateHtmlGameDto, @CurrentUser() user: AuthenticatedUser) {
    return this.games.create(dto, user);
  }

  @Post(':id/package')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: DEFAULT_HTML_GAME_MAX_UPLOAD_BYTES, files: 1 },
  }))
  @ApiOperation({ summary: 'Tải một tệp HTML hoặc gói ZIP an toàn' })
  uploadPackage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.games.uploadPackage(id, file);
  }

  @Post(':id/source')
  @ApiOperation({ summary: 'Lưu mã HTML dán trực tiếp thành index.html trong object storage' })
  uploadSource(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: HtmlGameSourceDto) {
    return this.games.uploadSource(id, dto);
  }

  @Get(':id/questions')
  listQuestions(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.questions.list(id);
  }

  @Post(':id/questions')
  createQuestion(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: CreateHtmlGameQuestionDto) {
    return this.questions.create(id, dto);
  }

  @Patch(':id/questions/:questionId')
  updateQuestion(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('questionId', new ParseUUIDPipe({ version: '4' })) questionId: string,
    @Body() dto: UpdateHtmlGameQuestionDto,
  ) {
    return this.questions.update(id, questionId, dto);
  }

  @Delete(':id/questions/:questionId')
  removeQuestion(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('questionId', new ParseUUIDPipe({ version: '4' })) questionId: string,
  ) {
    return this.questions.remove(id, questionId);
  }

  @Put(':id/questions/reorder')
  reorderQuestions(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: ReorderHtmlGameQuestionsDto) {
    return this.questions.reorder(id, dto);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateHtmlGameDto) {
    return this.games.update(id, dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateHtmlGameStatusDto) {
    return this.games.updateStatus(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.games.remove(id);
  }
}
