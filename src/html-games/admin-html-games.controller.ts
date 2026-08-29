import {
  Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post,
  UploadedFile, UseGuards, UseInterceptors,
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

@ApiTags('Admin HTML Games')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/html-games')
export class AdminHtmlGamesController {
  constructor(private readonly games: HtmlGamesService) {}

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
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.games.uploadPackage(id, file);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateHtmlGameDto) {
    return this.games.update(id, dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateHtmlGameStatusDto) {
    return this.games.updateStatus(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.games.remove(id);
  }
}
