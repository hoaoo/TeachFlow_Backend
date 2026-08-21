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

  async findAll(teacherId?: string, filters?: {
    classroomId?: string;
    subjectId?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
  }) {
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
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.dateFrom || filters?.dateTo) {
      where.plannedDate = {};
      if (filters?.dateFrom) {
        where.plannedDate.gte = new Date(filters.dateFrom);
      }
      if (filters?.dateTo) {
        where.plannedDate.lte = new Date(filters.dateTo + 'T23:59:59');
      }
    }

    const plans = await this.prisma.teachingPlan.findMany({
      where,
      include: {
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
      },
      orderBy: [
        { plannedDate: 'asc' },
        { startTime: 'asc' },
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
      },
    });

    if (!plan) {
      throw new NotFoundException(`Không tìm thấy lịch dạy ${id}`);
    }

    if (teacherId && plan.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập lịch dạy này');
    }

    return this.mapTeachingPlan(plan);
  }

  async create(dto: CreateTeachingPlanDto, teacherId: string) {
    // Validate classroom belongs to this teacher
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: dto.classroomId },
    });
    if (!classroom || classroom.deletedAt || classroom.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền lên lịch cho lớp học này');
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

    // Validate time range
    if (dto.startTime && dto.endTime) {
      if (dto.startTime >= dto.endTime) {
        throw new BadRequestException('Giờ bắt đầu phải nhỏ hơn giờ kết thúc');
      }
    }

    // Check for time overlap on same date (for teacher OR classroom)
    if (dto.plannedDate && dto.startTime && dto.endTime) {
      const dayStart = new Date(dto.plannedDate + 'T00:00:00');
      const dayEnd = new Date(dto.plannedDate + 'T23:59:59');

      const existingPlans = await this.prisma.teachingPlan.findMany({
        where: {
          OR: [
            { teacherId },
            { classroomId: dto.classroomId },
          ],
          plannedDate: { gte: dayStart, lte: dayEnd },
          startTime: { not: null },
          endTime: { not: null },
        },
      });

      for (const existing of existingPlans) {
        if (existing.startTime && existing.endTime) {
          // Check actual overlap: startA < endB AND endA > startB
          if (dto.startTime < existing.endTime && dto.endTime > existing.startTime) {
            const isTeacherConflict = existing.teacherId === teacherId;
            const conflictTitle = existing.title || 'tiết dạy khác';
            throw new ConflictException(
              isTeacherConflict
                ? `Bạn đã có lịch dạy "${conflictTitle}" từ ${existing.startTime} đến ${existing.endTime} vào ngày này. Vui lòng chọn giờ khác.`
                : `Lớp ${classroom.name} đã có lịch học từ ${existing.startTime} đến ${existing.endTime} vào ngày này.`,
            );
          }
        }
      }
    }

    const plannedDate = dto.plannedDate ? new Date(dto.plannedDate) : null;

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
        room: dto.room?.trim() || null,
        weekNumber: dto.weekNumber || 1,
        plannedDate,
        startTime: dto.startTime || null,
        endTime: dto.endTime || null,
        notes: dto.notes?.trim() || null,
        meta: dto.meta || null,
        tone: dto.tone || 'teal',
      },
      include: {
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
      },
    });

    return this.mapTeachingPlan(plan);
  }

  async update(id: string, dto: UpdateTeachingPlanDto, teacherId: string) {
    const existingPlan = await this.prisma.teachingPlan.findUnique({
      where: { id },
    });

    if (!existingPlan) {
      throw new NotFoundException(`Không tìm thấy lịch dạy ${id}`);
    }

    if (existingPlan.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa lịch dạy này');
    }

    // Validate time range if provided or partially updated
    const startTime = dto.startTime !== undefined ? dto.startTime : existingPlan.startTime;
    const endTime = dto.endTime !== undefined ? dto.endTime : existingPlan.endTime;
    if (startTime && endTime && startTime >= endTime) {
      throw new BadRequestException('Giờ bắt đầu phải nhỏ hơn giờ kết thúc');
    }

    const targetDate = dto.plannedDate
      ? new Date(dto.plannedDate)
      : existingPlan.plannedDate;

    // Check overlap if date & time are set
    if (targetDate && startTime && endTime) {
      const dateIso = targetDate.toISOString().split('T')[0];
      const dayStart = new Date(dateIso + 'T00:00:00');
      const dayEnd = new Date(dateIso + 'T23:59:59');

      const overlapping = await this.prisma.teachingPlan.findMany({
        where: {
          id: { not: id },
          OR: [
            { teacherId },
            { classroomId: existingPlan.classroomId },
          ],
          plannedDate: { gte: dayStart, lte: dayEnd },
          startTime: { not: null },
          endTime: { not: null },
        },
      });

      for (const s of overlapping) {
        if (s.startTime && s.endTime) {
          if (startTime < s.endTime && endTime > s.startTime) {
            throw new ConflictException(
              `Đã có lịch dạy "${s.title || 'tiết dạy'}" từ ${s.startTime} đến ${s.endTime} vào ngày này (trùng thời gian).`,
            );
          }
        }
      }
    }

    const updated = await this.prisma.teachingPlan.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        subtitle: dto.subtitle,
        status: dto.status,
        meta: dto.meta,
        tone: dto.tone,
        room: dto.room?.trim(),
        weekNumber: dto.weekNumber,
        plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : undefined,
        startTime: dto.startTime,
        endTime: dto.endTime,
        notes: dto.notes?.trim(),
      },
      include: {
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
      },
    });

    return this.mapTeachingPlan(updated);
  }

  async remove(id: string, teacherId: string) {
    await this.findOne(id, teacherId);

    await this.prisma.teachingPlan.delete({
      where: { id },
    });

    return { success: true, message: 'Đã xóa lịch dạy' };
  }

  private mapTeachingPlan(p: any) {
    return {
      id: p.id,
      teacherId: p.teacherId,
      title: p.title || 'Tiết dạy',
      subtitle: p.subtitle || `${p.subject?.name || 'Môn học'} · ${p.classroom?.name || 'Lớp học'}`,
      status: p.status || 'PLANNED',
      room: p.room || null,
      notes: p.notes || null,
      meta: p.meta || null,
      tone: p.tone || 'teal',
      weekNumber: p.weekNumber || 1,
      plannedDate: p.plannedDate ? p.plannedDate.toISOString().split('T')[0] : null, // YYYY-MM-DD
      startTime: p.startTime || null,
      endTime: p.endTime || null,
      classroomId: p.classroomId,
      classroom: p.classroom ? {
        id: p.classroom.id,
        name: p.classroom.name,
        code: p.classroom.code,
        gradeName: p.classroom.grade?.name || null,
        room: p.classroom.room || null,
      } : undefined,
      subjectId: p.subjectId,
      subject: p.subject ? {
        id: p.subject.id,
        name: p.subject.name,
        code: p.subject.code,
      } : undefined,
      schoolYearId: p.schoolYearId,
      schoolYear: p.schoolYear ? {
        id: p.schoolYear.id,
        name: p.schoolYear.name,
        isCurrent: p.schoolYear.isCurrent,
      } : undefined,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
