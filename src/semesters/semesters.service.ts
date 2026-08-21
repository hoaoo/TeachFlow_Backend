import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSemesterDto } from './dto/create-semester.dto';
import { UpdateSemesterDto } from './dto/update-semester.dto';

@Injectable()
export class SemestersService {
  private readonly logger = new Logger(SemestersService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(query?: { schoolYearId?: string; isActive?: boolean }) {
    const where: any = {};

    if (query?.schoolYearId) {
      where.schoolYearId = query.schoolYearId;
    }

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    return this.prisma.semester.findMany({
      where,
      include: {
        schoolYear: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { startDate: 'asc' }],
    });
  }

  async findOne(id: string) {
    const semester = await this.prisma.semester.findUnique({
      where: { id },
      include: {
        schoolYear: true,
      },
    });

    if (!semester) {
      throw new NotFoundException(`Không tìm thấy học kỳ với mã ${id}`);
    }

    return semester;
  }

  async create(dto: CreateSemesterDto) {
    const schoolYear = await this.prisma.schoolYear.findUnique({
      where: { id: dto.schoolYearId },
    });

    if (!schoolYear) {
      throw new NotFoundException(`Không tìm thấy năm học với mã ${dto.schoolYearId}`);
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (startDate >= endDate) {
      throw new BadRequestException('Ngày bắt đầu học kỳ phải trước ngày kết thúc');
    }

    if (startDate < schoolYear.startDate || endDate > schoolYear.endDate) {
      throw new BadRequestException(
        `Khoảng thời gian học kỳ (${dto.startDate} - ${dto.endDate}) phải nằm trong khoảng thời gian năm học (${schoolYear.startDate.toISOString().slice(0, 10)} - ${schoolYear.endDate.toISOString().slice(0, 10)})`,
      );
    }

    const existingCode = await this.prisma.semester.findUnique({
      where: {
        schoolYearId_code: {
          schoolYearId: dto.schoolYearId,
          code: dto.code.trim().toUpperCase(),
        },
      },
    });

    if (existingCode) {
      throw new ConflictException(
        `Mã học kỳ "${dto.code}" đã tồn tại trong năm học "${schoolYear.name}"`,
      );
    }

    return this.prisma.semester.create({
      data: {
        schoolYearId: dto.schoolYearId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        startDate,
        endDate,
        sortOrder: dto.sortOrder || 1,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
      include: {
        schoolYear: true,
      },
    });
  }

  async update(id: string, dto: UpdateSemesterDto) {
    const existing = await this.findOne(id);
    const schoolYearId = dto.schoolYearId || existing.schoolYearId;

    const schoolYear = await this.prisma.schoolYear.findUnique({
      where: { id: schoolYearId },
    });

    if (!schoolYear) {
      throw new NotFoundException(`Không tìm thấy năm học với mã ${schoolYearId}`);
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : existing.endDate;

    if (startDate >= endDate) {
      throw new BadRequestException('Ngày bắt đầu học kỳ phải trước ngày kết thúc');
    }

    if (startDate < schoolYear.startDate || endDate > schoolYear.endDate) {
      throw new BadRequestException(
        `Khoảng thời gian học kỳ (${startDate.toISOString().slice(0, 10)} - ${endDate.toISOString().slice(0, 10)}) phải nằm trong khoảng thời gian năm học (${schoolYear.startDate.toISOString().slice(0, 10)} - ${schoolYear.endDate.toISOString().slice(0, 10)})`,
      );
    }

    if (dto.code && dto.code.trim().toUpperCase() !== existing.code) {
      const duplicateCode = await this.prisma.semester.findUnique({
        where: {
          schoolYearId_code: {
            schoolYearId,
            code: dto.code.trim().toUpperCase(),
          },
        },
      });

      if (duplicateCode && duplicateCode.id !== id) {
        throw new ConflictException(
          `Mã học kỳ "${dto.code}" đã tồn tại trong năm học "${schoolYear.name}"`,
        );
      }
    }

    return this.prisma.semester.update({
      where: { id },
      data: {
        schoolYearId: dto.schoolYearId,
        code: dto.code ? dto.code.trim().toUpperCase() : undefined,
        name: dto.name ? dto.name.trim() : undefined,
        startDate: dto.startDate ? startDate : undefined,
        endDate: dto.endDate ? endDate : undefined,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
      include: {
        schoolYear: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.semester.delete({
      where: { id },
    });
  }
}
