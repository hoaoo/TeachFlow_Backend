import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSchoolYearDto } from './dto/create-school-year.dto';
import { UpdateSchoolYearDto } from './dto/update-school-year.dto';

@Injectable()
export class SchoolYearsService {
  private readonly logger = new Logger(SchoolYearsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(query?: { keyword?: string; isActive?: boolean }) {
    const where: any = {};

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query?.keyword) {
      where.name = { contains: query.keyword.trim(), mode: 'insensitive' };
    }

    return this.prisma.schoolYear.findMany({
      where,
      include: {
        semesters: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: {
            classrooms: true,
            semesters: true,
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async getCurrent() {
    const current = await this.prisma.schoolYear.findFirst({
      where: { isCurrent: true, isActive: true },
      include: {
        semesters: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!current) {
      // Fallback to latest active school year
      const latest = await this.prisma.schoolYear.findFirst({
        where: { isActive: true },
        orderBy: { startDate: 'desc' },
        include: {
          semesters: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      if (!latest) {
        throw new NotFoundException('Chưa có năm học nào được thiết lập trong hệ thống');
      }

      return latest;
    }

    return current;
  }

  async findOne(id: string) {
    const schoolYear = await this.prisma.schoolYear.findUnique({
      where: { id },
      include: {
        semesters: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: {
            classrooms: true,
            semesters: true,
            teachingPlans: true,
            assessments: true,
          },
        },
      },
    });

    if (!schoolYear) {
      throw new NotFoundException(`Không tìm thấy năm học với mã ${id}`);
    }

    return schoolYear;
  }

  async create(dto: CreateSchoolYearDto) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (startDate >= endDate) {
      throw new BadRequestException('Ngày bắt đầu năm học phải trước ngày kết thúc');
    }

    const existingName = await this.prisma.schoolYear.findUnique({
      where: { name: dto.name.trim() },
    });

    if (existingName) {
      throw new ConflictException(`Năm học "${dto.name}" đã tồn tại trong hệ thống`);
    }

    if (dto.isCurrent) {
      return this.prisma.$transaction(async (tx) => {
        await tx.schoolYear.updateMany({
          where: { isCurrent: true },
          data: { isCurrent: false },
        });

        return tx.schoolYear.create({
          data: {
            name: dto.name.trim(),
            startDate,
            endDate,
            isCurrent: true,
            isActive: dto.isActive !== undefined ? dto.isActive : true,
          },
          include: {
            semesters: true,
          },
        });
      });
    }

    return this.prisma.schoolYear.create({
      data: {
        name: dto.name.trim(),
        startDate,
        endDate,
        isCurrent: false,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
      include: {
        semesters: true,
      },
    });
  }

  async update(id: string, dto: UpdateSchoolYearDto) {
    const existing = await this.findOne(id);

    const startDate = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : existing.endDate;

    if (startDate >= endDate) {
      throw new BadRequestException('Ngày bắt đầu năm học phải trước ngày kết thúc');
    }

    if (dto.name && dto.name.trim() !== existing.name) {
      const duplicateName = await this.prisma.schoolYear.findUnique({
        where: { name: dto.name.trim() },
      });
      if (duplicateName && duplicateName.id !== id) {
        throw new ConflictException(`Năm học "${dto.name}" đã tồn tại trong hệ thống`);
      }
    }

    if (dto.isCurrent === true) {
      return this.prisma.$transaction(async (tx) => {
        await tx.schoolYear.updateMany({
          where: { isCurrent: true, id: { not: id } },
          data: { isCurrent: false },
        });

        return tx.schoolYear.update({
          where: { id },
          data: {
            name: dto.name ? dto.name.trim() : undefined,
            startDate: dto.startDate ? startDate : undefined,
            endDate: dto.endDate ? endDate : undefined,
            isCurrent: true,
            isActive: dto.isActive !== undefined ? dto.isActive : true,
          },
          include: {
            semesters: true,
          },
        });
      });
    }

    return this.prisma.schoolYear.update({
      where: { id },
      data: {
        name: dto.name ? dto.name.trim() : undefined,
        startDate: dto.startDate ? startDate : undefined,
        endDate: dto.endDate ? endDate : undefined,
        isCurrent: dto.isCurrent !== undefined ? dto.isCurrent : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
      include: {
        semesters: true,
      },
    });
  }

  async setCurrent(id: string) {
    await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      await tx.schoolYear.updateMany({
        where: { isCurrent: true, id: { not: id } },
        data: { isCurrent: false },
      });

      return tx.schoolYear.update({
        where: { id },
        data: { isCurrent: true, isActive: true },
        include: {
          semesters: true,
        },
      });
    });
  }

  async remove(id: string) {
    const existing = await this.findOne(id);

    const counts = await this.prisma.schoolYear.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            classrooms: true,
            teachingPlans: true,
            assessments: true,
            weeklyClassReviews: true,
            monthlyClassReviews: true,
          },
        },
      },
    });

    const totalReferenced =
      (counts?._count.classrooms || 0) +
      (counts?._count.teachingPlans || 0) +
      (counts?._count.assessments || 0) +
      (counts?._count.weeklyClassReviews || 0) +
      (counts?._count.monthlyClassReviews || 0);

    if (totalReferenced > 0) {
      throw new ConflictException(
        `Không thể xóa năm học "${existing.name}" vì đang có ${totalReferenced} bản ghi lớp học/kế hoạch/đánh giá liên kết. Vui lòng chuyển trạng thái sang không hoạt động.`,
      );
    }

    return this.prisma.schoolYear.delete({
      where: { id },
    });
  }
}
