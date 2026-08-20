import { Controller, Get, Module, Injectable } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SchoolYearsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.schoolYear.findMany({
      orderBy: { startDate: 'desc' },
    });
  }
}

@ApiTags('School Years')
@ApiBearerAuth()
@Controller('school-years')
export class SchoolYearsController {
  constructor(private service: SchoolYearsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách năm học' })
  async findAll() {
    return this.service.findAll();
  }
}

@Module({
  controllers: [SchoolYearsController],
  providers: [SchoolYearsService],
  exports: [SchoolYearsService],
})
export class SchoolYearsModule {}
