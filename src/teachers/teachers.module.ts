import { Controller, Get, Module, Injectable } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeachersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.teacher.findMany({
      include: {
        classrooms: { where: { deletedAt: null } },
      },
    });
  }
}

@ApiTags('Teachers')
@ApiBearerAuth()
@Controller('teachers')
export class TeachersController {
  constructor(private service: TeachersService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách giáo viên' })
  async findAll() {
    return this.service.findAll();
  }
}

@Module({
  controllers: [TeachersController],
  providers: [TeachersService],
  exports: [TeachersService],
})
export class TeachersModule {}
