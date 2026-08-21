import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';

@Injectable()
export class SubjectsService {
  private readonly logger = new Logger(SubjectsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(query?: { isActive?: boolean; status?: string; keyword?: string }) {
    const where: any = {};

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    } else if (query?.status) {
      where.status = query.status;
    }

    if (query?.keyword) {
      where.OR = [
        { name: { contains: query.keyword.trim(), mode: 'insensitive' } },
        { code: { contains: query.keyword.trim(), mode: 'insensitive' } },
      ];
    }

    return this.prisma.subject.findMany({
      where,
      include: {
        _count: {
          select: {
            lessons: true,
            teachingPlans: true,
            lessonPlans: true,
            teachingActivities: true,
            worksheets: true,
            assessments: true,
            studentComments: true,
            teachingResources: true,
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            lessons: true,
            teachingPlans: true,
            lessonPlans: true,
            teachingActivities: true,
            worksheets: true,
            assessments: true,
            studentComments: true,
            teachingResources: true,
          },
        },
      },
    });

    if (!subject) {
      throw new NotFoundException(`Không tìm thấy môn học với mã ${id}`);
    }

    return subject;
  }

  async create(dto: CreateSubjectDto) {
    const code = dto.code.trim().toUpperCase();

    const existingCode = await this.prisma.subject.findUnique({
      where: { code },
    });

    if (existingCode) {
      throw new ConflictException(`Mã môn học "${code}" đã tồn tại trong hệ thống`);
    }

    const isActive = dto.isActive !== undefined ? dto.isActive : dto.status !== 'INACTIVE';
    const status = dto.status || (isActive ? 'ACTIVE' : 'INACTIVE');

    return this.prisma.subject.create({
      data: {
        code,
        name: dto.name.trim(),
        isActive,
        status,
        sortOrder: dto.sortOrder !== undefined ? dto.sortOrder : 0,
      },
    });
  }

  async update(id: string, dto: UpdateSubjectDto) {
    const existing = await this.findOne(id);

    if (dto.code && dto.code.trim().toUpperCase() !== existing.code) {
      const duplicateCode = await this.prisma.subject.findUnique({
        where: { code: dto.code.trim().toUpperCase() },
      });

      if (duplicateCode && duplicateCode.id !== id) {
        throw new ConflictException(`Mã môn học "${dto.code}" đã tồn tại trong hệ thống`);
      }
    }

    let isActive = dto.isActive;
    let status = dto.status;

    if (isActive !== undefined && status === undefined) {
      status = isActive ? 'ACTIVE' : 'INACTIVE';
    } else if (status !== undefined && isActive === undefined) {
      isActive = status === 'ACTIVE';
    }

    return this.prisma.subject.update({
      where: { id },
      data: {
        code: dto.code ? dto.code.trim().toUpperCase() : undefined,
        name: dto.name ? dto.name.trim() : undefined,
        isActive,
        status,
        sortOrder: dto.sortOrder !== undefined ? dto.sortOrder : undefined,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.findOne(id);

    const counts = await this.prisma.subject.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            lessons: true,
            teachingPlans: true,
            lessonPlans: true,
            teachingActivities: true,
            worksheets: true,
            assessments: true,
            studentComments: true,
            teachingResources: true,
          },
        },
      },
    });

    const totalReferenced =
      (counts?._count.lessons || 0) +
      (counts?._count.teachingPlans || 0) +
      (counts?._count.lessonPlans || 0) +
      (counts?._count.teachingActivities || 0) +
      (counts?._count.worksheets || 0) +
      (counts?._count.assessments || 0) +
      (counts?._count.studentComments || 0) +
      (counts?._count.teachingResources || 0);

    if (totalReferenced > 0) {
      throw new ConflictException(
        `Không thể xóa môn học "${existing.name}" vì đang có ${totalReferenced} bản ghi kế hoạch/giáo án/đánh giá/tài nguyên liên kết. Vui lòng chuyển trạng thái không hoạt động.`,
      );
    }

    return this.prisma.subject.delete({
      where: { id },
    });
  }
}
