import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeachingPlanDto } from './dto/create-teaching-plan.dto';
import { UpdateTeachingPlanDto } from './dto/update-teaching-plan.dto';

@Injectable()
export class TeachingPlansService {
  constructor(private prisma: PrismaService) {}

  async findAll(teacherId?: string) {
    const where: any = {};
    if (teacherId) {
      where.teacherId = teacherId;
    }

    const plans = await this.prisma.teachingPlan.findMany({
      where,
      include: {
        classroom: true,
        subject: true,
        schoolYear: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return plans.map((p) => this.mapTeachingPlan(p));
  }

  async findOne(id: string, teacherId?: string) {
    const plan = await this.prisma.teachingPlan.findUnique({
      where: { id },
      include: { classroom: true, subject: true, schoolYear: true },
    });

    if (!plan) {
      throw new NotFoundException(`Không tìm thấy kế hoạch dạy học ${id}`);
    }

    if (teacherId && plan.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập kế hoạch này');
    }

    return this.mapTeachingPlan(plan);
  }

  async create(dto: CreateTeachingPlanDto, teacherId: string) {
    let classroomId = dto.classroomId;
    let subjectId = dto.subjectId;
    let schoolYearId = dto.schoolYearId;

    if (classroomId) {
      const cls = await this.prisma.classroom.findUnique({
        where: { id: classroomId },
      });
      if (!cls || cls.deletedAt || cls.teacherId !== teacherId) {
        throw new ForbiddenException('Bạn không có quyền lên lịch cho lớp học này');
      }
      schoolYearId = schoolYearId || cls.schoolYearId;
    } else {
      const cls = await this.prisma.classroom.findFirst({
        where: { teacherId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (!cls) {
        throw new BadRequestException('Vui lòng tạo lớp học trước khi tạo kế hoạch dạy học');
      }
      classroomId = cls.id;
      schoolYearId = schoolYearId || cls.schoolYearId;
    }

    if (!subjectId) {
      const sub = await this.prisma.subject.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      if (sub) {
        subjectId = sub.id;
      }
    }

    if (!schoolYearId) {
      const sy = await this.prisma.schoolYear.findFirst({
        where: { isCurrent: true, isActive: true },
      });
      schoolYearId = sy?.id;
    }

    if (!classroomId || !subjectId || !schoolYearId) {
      throw new BadRequestException('Thiếu thông tin lớp học, môn học hoặc năm học');
    }

    const existing = this.prisma.teachingPlan.findFirst
      ? await this.prisma.teachingPlan.findFirst({
          where: {
            teacherId,
            classroomId,
            subjectId,
            title: dto.title.trim(),
          },
        })
      : null;

    if (existing) {
      throw new ConflictException(`Kế hoạch dạy học "${dto.title.trim()}" đã tồn tại cho lớp và môn học này`);
    }

    const plan = await this.prisma.teachingPlan.create({
      data: {
        teacherId,
        classroomId,
        subjectId,
        schoolYearId,
        title: dto.title.trim(),
        subtitle: dto.subtitle || 'Kế hoạch giảng dạy',
        status: dto.status || 'Đã lên lịch',
        meta: dto.meta || '07:30 · Phòng học',
        tone: dto.tone || 'teal',
        room: dto.room || 'Phòng học',
        weekNumber: dto.weekNumber || 1,
      },
    });

    return this.mapTeachingPlan(plan);
  }

  async update(id: string, dto: UpdateTeachingPlanDto, teacherId: string) {
    await this.findOne(id, teacherId);

    const updated = await this.prisma.teachingPlan.update({
      where: { id },
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        status: dto.status,
        meta: dto.meta,
        tone: dto.tone,
        room: dto.room,
        weekNumber: dto.weekNumber,
      },
    });

    return this.mapTeachingPlan(updated);
  }

  async remove(id: string, teacherId: string) {
    await this.findOne(id, teacherId);

    await this.prisma.teachingPlan.delete({
      where: { id },
    });

    return { success: true, message: 'Đã xóa kế hoạch dạy học' };
  }

  private mapTeachingPlan(p: any) {
    return {
      id: p.id,
      title: p.title || 'Tiết dạy',
      subtitle: p.subtitle || `${p.subject?.name || 'Toán'} · ${p.classroom?.name || 'Lớp 4A'}`,
      status: p.status || 'Đã lên lịch',
      meta: p.meta || `${p.room || 'Phòng 204'} · Tuần ${p.weekNumber || 1}`,
      tone: p.tone || 'teal',
    };
  }
}
