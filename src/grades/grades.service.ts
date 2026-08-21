import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGradeDto } from './dto/create-grade.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';

@Injectable()
export class GradesService {
  private readonly logger = new Logger(GradesService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(query?: { isActive?: boolean; keyword?: string }) {
    const where: any = {};

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query?.keyword) {
      where.OR = [
        { name: { contains: query.keyword.trim(), mode: 'insensitive' } },
        { code: { contains: query.keyword.trim(), mode: 'insensitive' } },
      ];
    }

    return this.prisma.grade.findMany({
      where,
      include: {
        _count: {
          select: {
            classrooms: true,
            lessons: true,
            teachingActivities: true,
            worksheets: true,
            teachingResources: true,
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { level: 'asc' }],
    });
  }

  async findOne(id: string) {
    const grade = await this.prisma.grade.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            classrooms: true,
            lessons: true,
            teachingActivities: true,
            worksheets: true,
            teachingResources: true,
          },
        },
      },
    });

    if (!grade) {
      throw new NotFoundException(`Không tìm thấy khối lớp với mã ${id}`);
    }

    return grade;
  }

  async create(dto: CreateGradeDto) {
    const code = dto.code
      ? dto.code.trim().toUpperCase()
      : `K${dto.level.toString().padStart(2, '0')}`;

    const existingCode = await this.prisma.grade.findUnique({
      where: { code },
    });

    if (existingCode) {
      throw new ConflictException(`Mã khối lớp "${code}" đã tồn tại trong hệ thống`);
    }

    return this.prisma.grade.create({
      data: {
        code,
        name: dto.name.trim(),
        level: dto.level,
        sortOrder: dto.sortOrder !== undefined ? dto.sortOrder : dto.level,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });
  }

  async update(id: string, dto: UpdateGradeDto) {
    const existing = await this.findOne(id);

    if (dto.code && dto.code.trim().toUpperCase() !== existing.code) {
      const duplicateCode = await this.prisma.grade.findUnique({
        where: { code: dto.code.trim().toUpperCase() },
      });

      if (duplicateCode && duplicateCode.id !== id) {
        throw new ConflictException(`Mã khối lớp "${dto.code}" đã tồn tại trong hệ thống`);
      }
    }

    return this.prisma.grade.update({
      where: { id },
      data: {
        code: dto.code ? dto.code.trim().toUpperCase() : undefined,
        name: dto.name ? dto.name.trim() : undefined,
        level: dto.level !== undefined ? dto.level : undefined,
        sortOrder: dto.sortOrder !== undefined ? dto.sortOrder : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.findOne(id);

    const counts = await this.prisma.grade.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            classrooms: true,
            lessons: true,
            teachingActivities: true,
            worksheets: true,
            teachingResources: true,
          },
        },
      },
    });

    const totalReferenced =
      (counts?._count.classrooms || 0) +
      (counts?._count.lessons || 0) +
      (counts?._count.teachingActivities || 0) +
      (counts?._count.worksheets || 0) +
      (counts?._count.teachingResources || 0);

    if (totalReferenced > 0) {
      throw new ConflictException(
        `Không thể xóa khối "${existing.name}" vì đang có ${totalReferenced} bản ghi lớp học/bài học/tài nguyên tham chiếu. Vui lòng chuyển trạng thái không hoạt động.`,
      );
    }

    return this.prisma.grade.delete({
      where: { id },
    });
  }
}
