import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';
import { TemplatesService } from './templates.service';
@ApiTags('Teacher Templates') @ApiBearerAuth() @Controller('templates')
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}
  @Get() findAll(@Query('type') type: string, @CurrentUser() user: AuthenticatedUser) { return this.service.findAll(user.teacherId, type); }
  @Post() create(@Body() dto: CreateTemplateDto, @CurrentUser() user: AuthenticatedUser) { return this.service.create(dto, user.teacherId); }
  @Post('from-lesson-plan/:lessonPlanId') saveLessonPlan(@Param('lessonPlanId') id: string, @Body() body: { name?: string }, @CurrentUser() user: AuthenticatedUser) { return this.service.saveLessonPlan(id, body?.name, user.teacherId); }
  @Post('from-worksheet/:worksheetId') saveWorksheet(@Param('worksheetId') id: string, @Body() body: { name?: string }, @CurrentUser() user: AuthenticatedUser) { return this.service.saveWorksheet(id, body?.name, user.teacherId); }
  @Get(':id') findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.findOne(id, user.teacherId); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateTemplateDto, @CurrentUser() user: AuthenticatedUser) { return this.service.update(id, dto, user.teacherId); }
  @Delete(':id') remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.remove(id, user.teacherId); }
  @Post(':id/use') use(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.use(id, user.teacherId); }
}
