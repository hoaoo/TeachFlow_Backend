import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeachingPlanDto } from './dto/create-teaching-plan.dto';
import { UpdateTeachingPlanDto } from './dto/update-teaching-plan.dto';

@Injectable()
export class TeachingPlansService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    teacherId?: string,
    filters?: {
      classroomId?: string;
      subjectId?: string;
      schoolYearId?: string;
      status?: string;
    },
  ) {
    const where: any = {};
    if (teacherId) {
      where.teacherId = teacherId;
    }
    if (filters?.classroomId) {
      where.classroomId = filters.classroomId;
    }
    if (filters?.subjectId) {
      where.subjectId = filters.subjectId;
    }
    if (filters?.schoolYearId) {
      where.schoolYearId = filters.schoolYearId;
    }
    if (filters?.status) {
      where.status = filters.status;
    }

    const plans = await this.prisma.teachingPlan.findMany({
      where,
      include: {
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
        lesson: true,
      },
      orderBy: [
        { weekNumber: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return plans.map((p) => this.mapTeachingPlan(p));
  }

  async findOne(id: string, teacherId?: string) {
    const plan = await this.prisma.teachingPlan.findUnique({
      where: { id },
      include: {
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
        lesson: true,
      },
    });

    if (!plan) {
      throw new NotFoundException(`Không tìm thấy kế hoạch dạy học ${id}`);
    }

    if (teacherId && plan.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập kế hoạch dạy học này');
    }

    return this.mapTeachingPlan(plan);
  }

  async create(dto: CreateTeachingPlanDto, teacherId: string) {
    // Validate classroom belongs to this teacher
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: dto.classroomId },
    });
    if (!classroom || classroom.deletedAt || classroom.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền tạo kế hoạch cho lớp học này');
    }

    const schoolYearId = dto.schoolYearId || classroom.schoolYearId;

    // Validate subject exists
    const subject = await this.prisma.subject.findUnique({
      where: { id: dto.subjectId },
    });
    if (!subject || !subject.isActive) {
      throw new NotFoundException(`Không tìm thấy môn học với mã ${dto.subjectId}`);
    }

    // Validate schoolYear
    const schoolYear = await this.prisma.schoolYear.findUnique({
      where: { id: schoolYearId },
    });
    if (!schoolYear) {
      throw new BadRequestException('Không tìm thấy năm học hợp lệ');
    }

    const plan = await this.prisma.teachingPlan.create({
      data: {
        teacherId,
        classroomId: dto.classroomId,
        subjectId: dto.subjectId,
        schoolYearId,
        lessonId: dto.lessonId || null,
        title: dto.title.trim(),
        subtitle: dto.subtitle || `${subject.name} · ${classroom.name}`,
        status: dto.status || 'PLANNED',
        weekNumber: dto.weekNumber || 1,
        numberOfPeriods: dto.numberOfPeriods || 1,
        meta: dto.meta || null,
        tone: dto.tone || 'teal',
      },
      include: {
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
        lesson: true,
      },
    });

    return this.mapTeachingPlan(plan);
  }

  async update(id: string, dto: UpdateTeachingPlanDto, teacherId: string) {
    const existing = await this.prisma.teachingPlan.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Không tìm thấy kế hoạch dạy học ${id}`);
    }

    if (existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa kế hoạch dạy học này');
    }

    const updated = await this.prisma.teachingPlan.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        subtitle: dto.subtitle,
        status: dto.status,
        meta: dto.meta,
        tone: dto.tone,
        weekNumber: dto.weekNumber,
        numberOfPeriods: dto.numberOfPeriods,
        lessonId: dto.lessonId,
      },
      include: {
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
        lesson: true,
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
      teacherId: p.teacherId,
      title: p.title || 'Kế hoạch dạy học',
      subtitle: p.subtitle || `${p.subject?.name || 'Môn học'} · ${p.classroom?.name || 'Lớp học'}`,
      status: p.status || 'PLANNED',
      meta: p.meta || null,
      tone: p.tone || 'teal',
      weekNumber: p.weekNumber || 1,
      numberOfPeriods: p.numberOfPeriods || 1,
      classroomId: p.classroomId,
      classroom: p.classroom
        ? {
            id: p.classroom.id,
            name: p.classroom.name,
            code: p.classroom.code,
            gradeName: p.classroom.grade?.name || null,
            room: p.classroom.room || null,
          }
        : undefined,
      subjectId: p.subjectId,
      subject: p.subject
        ? {
            id: p.subject.id,
            name: p.subject.name,
            code: p.subject.code,
          }
        : undefined,
      schoolYearId: p.schoolYearId,
      schoolYear: p.schoolYear
        ? {
            id: p.schoolYear.id,
            name: p.schoolYear.name,
            isCurrent: p.schoolYear.isCurrent,
          }
        : undefined,
      lessonId: p.lessonId || null,
      lesson: p.lesson ? { id: p.lesson.id, title: p.lesson.title } : undefined,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
