import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreateSeatingPlanDto, UpdateSeatingPlanDto } from './dto/seating-plan.dto';
import { SeatingPlansService } from './seating-plans.service';
@ApiTags('Seating Plans') @ApiBearerAuth() @Controller('seating-plans')
export class SeatingPlansController {
  constructor(private readonly service: SeatingPlansService) {}
  @Get() findAll(@Query('classroomId') classroomId: string, @CurrentUser() user: AuthenticatedUser) { return classroomId ? this.service.findAll(classroomId, user.teacherId) : []; }
  @Post() create(@Body() dto: CreateSeatingPlanDto & { classroomId: string }, @CurrentUser() user: AuthenticatedUser) { return this.service.create(dto, user.teacherId); }
  @Get(':id') findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.findOne(id, user.teacherId); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateSeatingPlanDto, @CurrentUser() user: AuthenticatedUser) { return this.service.update(id, dto, user.teacherId); }
  @Post(':id/randomize') randomize(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.randomize(id, user.teacherId); }
  @Post(':id/reset') reset(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.reset(id, user.teacherId); }
  @Delete(':id') remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.remove(id, user.teacherId); }
}
