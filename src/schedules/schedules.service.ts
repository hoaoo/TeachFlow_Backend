import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

@Injectable()
export class SchedulesService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    teacherId: string,
    filters?: {
      classroomId?: string;
      subjectId?: string;
      dateFrom?: string;
      dateTo?: string;
      status?: string;
    },
  ) {
    const where: any = {
      teacherId,
      deletedAt: null,
    };

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
        where.plannedDate.gte = new Date(filters.dateFrom + 'T00:00:00');
      }
      if (filters?.dateTo) {
        where.plannedDate.lte = new Date(filters.dateTo + 'T23:59:59');
      }
    }

    const schedules = await this.prisma.schedule.findMany({
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

    return schedules.map((s) => this.mapSchedule(s));
  }

  async findOne(id: string, teacherId?: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
      include: {
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
      },
    });

    if (!schedule || schedule.deletedAt) {
      throw new NotFoundException(`Không tìm thấy lịch dạy ${id}`);
    }

    if (teacherId && schedule.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập lịch dạy này');
    }

    return this.mapSchedule(schedule);
  }

  async create(dto: CreateScheduleDto, teacherId: string) {
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

      const existingSchedules = await this.prisma.schedule.findMany({
        where: {
          deletedAt: null,
          OR: [
            { teacherId },
            { classroomId: dto.classroomId },
          ],
          plannedDate: { gte: dayStart, lte: dayEnd },
        },
      });

      for (const existing of existingSchedules) {
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

    const plannedDate = dto.plannedDate
      ? new Date(dto.plannedDate + 'T00:00:00')
      : new Date();

    const schedule = await this.prisma.schedule.create({
      data: {
        teacherId,
        classroomId: dto.classroomId,
        subjectId: dto.subjectId,
        schoolYearId,
        title: dto.title.trim(),
        plannedDate,
        startTime: dto.startTime || '07:00',
        endTime: dto.endTime || '07:45',
        status: dto.status || 'PLANNED',
        room: dto.room?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
      include: {
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
      },
    });

    return this.mapSchedule(schedule);
  }

  async update(id: string, dto: UpdateScheduleDto, teacherId: string) {
    const existing = await this.prisma.schedule.findUnique({
      where: { id },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Không tìm thấy lịch dạy ${id}`);
    }

    if (existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa lịch dạy này');
    }

    const startTime = dto.startTime !== undefined ? dto.startTime : existing.startTime;
    const endTime = dto.endTime !== undefined ? dto.endTime : existing.endTime;
    if (startTime && endTime && startTime >= endTime) {
      throw new BadRequestException('Giờ bắt đầu phải nhỏ hơn giờ kết thúc');
    }

    const targetDate = dto.plannedDate
      ? new Date(dto.plannedDate + 'T00:00:00')
      : existing.plannedDate;

    // Check overlap if date & time are set
    if (targetDate && startTime && endTime) {
      const dateIso = targetDate.toISOString().split('T')[0];
      const dayStart = new Date(dateIso + 'T00:00:00');
      const dayEnd = new Date(dateIso + 'T23:59:59');

      const overlapping = await this.prisma.schedule.findMany({
        where: {
          id: { not: id },
          deletedAt: null,
          OR: [
            { teacherId },
            { classroomId: existing.classroomId },
          ],
          plannedDate: { gte: dayStart, lte: dayEnd },
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

    const updated = await this.prisma.schedule.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        status: dto.status,
        room: dto.room?.trim(),
        plannedDate: dto.plannedDate ? new Date(dto.plannedDate + 'T00:00:00') : undefined,
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

    return this.mapSchedule(updated);
  }

  async remove(id: string, teacherId: string) {
    await this.findOne(id, teacherId);

    await this.prisma.schedule.delete({
      where: { id },
    });

    return { success: true, message: 'Đã xóa lịch dạy' };
  }

  private mapSchedule(s: any) {
    return {
      id: s.id,
      teacherId: s.teacherId,
      title: s.title,
      status: s.status || 'PLANNED',
      room: s.room || null,
      notes: s.notes || null,
      plannedDate: s.plannedDate ? s.plannedDate.toISOString().split('T')[0] : null,
      startTime: s.startTime || null,
      endTime: s.endTime || null,
      classroomId: s.classroomId,
      classroom: s.classroom
        ? {
            id: s.classroom.id,
            name: s.classroom.name,
            code: s.classroom.code,
            gradeName: s.classroom.grade?.name || null,
            room: s.classroom.room || null,
          }
        : undefined,
      subjectId: s.subjectId,
      subject: s.subject
        ? {
            id: s.subject.id,
            name: s.subject.name,
            code: s.subject.code,
          }
        : undefined,
      schoolYearId: s.schoolYearId,
      schoolYear: s.schoolYear
        ? {
            id: s.schoolYear.id,
            name: s.schoolYear.name,
            isCurrent: s.schoolYear.isCurrent,
          }
        : undefined,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }
}
