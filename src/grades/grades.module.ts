import { Controller, Get, Module, Injectable } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GradesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.grade.findMany({
      orderBy: { level: 'asc' },
    });
  }
}

@ApiTags('Grades')
@ApiBearerAuth()
@Controller('grades')
export class GradesController {
  constructor(private service: GradesService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách khối lớp' })
  async findAll() {
    return this.service.findAll();
  }
}

@Module({
  controllers: [GradesController],
  providers: [GradesService],
  exports: [GradesService],
})
export class GradesModule {}
