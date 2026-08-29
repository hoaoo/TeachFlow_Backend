import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { HtmlGameQueryDto } from './dto/html-game-query.dto';
import { HtmlGamesService } from './html-games.service';

@ApiTags('HTML Games')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('ADMIN', 'TEACHER')
@Controller('html-games')
export class HtmlGamesController {
  constructor(private readonly games: HtmlGamesService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách trò chơi; giáo viên chỉ thấy bản đã xuất bản' })
  findAll(
    @Query() query: HtmlGameQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.games.findAll(query, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.games.findOne(id, user);
  }

  @Get(':id/play')
  play(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.games.getPlay(id, user);
  }
}
