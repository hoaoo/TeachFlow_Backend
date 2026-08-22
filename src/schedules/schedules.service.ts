import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { DuplicateScheduleDto } from './dto/duplicate-schedule.dto';
import { UpdateScheduleStatusDto } from './dto/update-status.dto';
import { LinkLessonPlanDto } from './dto/link-lesson-plan.dto';

@Injectable()
export class SchedulesService {
  constructor(
    private prisma: PrismaService,
    @Optional() private auditService?: AuditService,
    @Optional() private notificationsService?: NotificationsService,
  ) {}

  /**
   * Helper to check time overlap for a given date, startTime and endTime.
   * Condition: existingStart < newEnd AND existingEnd > newStart
   * Adjacent slots (e.g. 07:00-07:45 and 07:45-08:30) are NOT overlapping.
   */
  private async checkConflict(params: {
    teacherId: string;
    classroomId: string;
    plannedDate: Date;
    startTime: string;
    endTime: string;
    excludeScheduleId?: string;
    classroomName?: string;
  }): Promise<void> {
    const { teacherId, classroomId, plannedDate, startTime, endTime, excludeScheduleId, classroomName } = params;

    const dateIso = plannedDate.toISOString().split('T')[0];
    const dayStart = new Date(dateIso + 'T00:00:00');
    const dayEnd = new Date(dateIso + 'T23:59:59');

    const overlapping = await this.prisma.schedule.findMany({
      where: {
        deletedAt: null,
        ...(excludeScheduleId ? { id: { not: excludeScheduleId } } : {}),
        OR: [
          { teacherId },
          { classroomId },
        ],
        plannedDate: { gte: dayStart, lte: dayEnd },
      },
      include: {
        classroom: true,
        subject: true,
      },
    });

    for (const existing of overlapping) {
      if (existing.startTime && existing.endTime && existing.status !== 'CANCELLED') {
        if (startTime < existing.endTime && endTime > existing.startTime) {
          const isTeacherConflict = existing.teacherId === teacherId;
          const conflictSubject = existing.subject?.name || 'môn học';
          const conflictClass = existing.classroom?.name || classroomName || 'lớp học';
          const dateStr = plannedDate.toLocaleDateString('vi-VN');

          if (isTeacherConflict) {
            throw new ConflictException(
              `Lịch dạy bị trùng với tiết ${conflictSubject} lớp ${conflictClass} lúc ${existing.startTime} - ${existing.endTime} ngày ${dateStr}.`,
            );
          } else {
            throw new ConflictException(
              `Lớp ${conflictClass} đã có lịch học tiết ${conflictSubject} lúc ${existing.startTime} - ${existing.endTime} ngày ${dateStr}.`,
            );
          }
        }
      }
    }
  }

  async findAll(
    teacherId: string,
    filters?: {
      classroomId?: string;
      subjectId?: string;
      dateFrom?: string;
      dateTo?: string;
      status?: string;
      search?: string;
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

    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
        { room: { contains: q, mode: 'insensitive' } },
        { classroom: { name: { contains: q, mode: 'insensitive' } } },
        { subject: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const schedules = await this.prisma.schedule.findMany({
      where,
      include: {
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
        lessonPlan: {
          select: {
            id: true,
            title: true,
            status: true,
            objectives: true,
          },
        },
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
        lessonPlan: {
          select: {
            id: true,
            title: true,
            status: true,
            objectives: true,
            teachingEquipment: true,
          },
        },
      },
    });

    if (!schedule || schedule.deletedAt) {
      throw new NotFoundException(`Không tìm thấy lịch dạy ${id}`);
    }

    if (teacherId && schedule.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập lịch dạy này');
    }

    // Check attendance status for this schedule's classroom and date
    const targetDate = new Date(schedule.plannedDate);
    targetDate.setHours(0, 0, 0, 0);

    const attendanceSession = await this.prisma.attendanceSession.findUnique({
      where: {
        classroomId_attendanceDate: {
          classroomId: schedule.classroomId,
          attendanceDate: targetDate,
        },
      },
      include: {
        attendances: true,
      },
    });

    const mapped = this.mapSchedule(schedule);
    return {
      ...mapped,
      attendance: attendanceSession
        ? {
            isRecorded: true,
            sessionId: attendanceSession.id,
            status: attendanceSession.status,
            totalStudents: attendanceSession.attendances.length,
            presentCount: attendanceSession.attendances.filter((a) => a.status === 'PRESENT').length,
            absentCount: attendanceSession.attendances.filter((a) => a.status === 'EXCUSED_ABSENCE' || a.status === 'UNEXCUSED_ABSENCE').length,
          }
        : {
            isRecorded: false,
            sessionId: null,
          },
    };
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
    const startTime = dto.startTime || '07:00';
    const endTime = dto.endTime || '07:45';
    if (startTime >= endTime) {
      throw new BadRequestException('Giờ bắt đầu phải nhỏ hơn giờ kết thúc');
    }

    // Validate lessonPlanId if provided
    if (dto.lessonPlanId) {
      const lp = await this.prisma.lessonPlan.findUnique({
        where: { id: dto.lessonPlanId },
      });
      if (!lp || lp.deletedAt || lp.teacherId !== teacherId) {
        throw new ForbiddenException('Giáo án không tồn tại hoặc không thuộc quyền sở hữu của bạn');
      }
    }

    const basePlannedDate = dto.plannedDate
      ? new Date(dto.plannedDate + 'T00:00:00')
      : new Date();
    basePlannedDate.setHours(0, 0, 0, 0);

    // ─── Case A: Recurring Schedule (Weekly) ──────────────────────────────────
    if (dto.recurrenceType === 'WEEKLY' && dto.recurrenceEndDate) {
      const endDate = new Date(dto.recurrenceEndDate + 'T23:59:59');
      if (endDate < basePlannedDate) {
        throw new BadRequestException('Ngày kết thúc lặp lại phải sau hoặc bằng ngày bắt đầu');
      }

      // Generate dates (weekly, max 52 occurrences to prevent overflow)
      const occurrenceDates: Date[] = [];
      const cur = new Date(basePlannedDate);
      let count = 0;
      while (cur <= endDate && count < 52) {
        occurrenceDates.push(new Date(cur));
        cur.setDate(cur.getDate() + 7);
        count++;
      }

      if (occurrenceDates.length === 0) {
        throw new BadRequestException('Không có ngày hợp lệ trong khoảng lặp lại đã chọn');
      }

      // Check conflict for EVERY occurrence before creating any
      for (const occDate of occurrenceDates) {
        await this.checkConflict({
          teacherId,
          classroomId: dto.classroomId,
          plannedDate: occDate,
          startTime,
          endTime,
          classroomName: classroom.name,
        });
      }

      const recurrenceGroupId = randomUUID();

      const createdList = await this.prisma.$transaction(
        occurrenceDates.map((occDate) =>
          this.prisma.schedule.create({
            data: {
              teacherId,
              classroomId: dto.classroomId,
              subjectId: dto.subjectId,
              schoolYearId,
              lessonPlanId: dto.lessonPlanId || null,
              title: dto.title.trim(),
              plannedDate: occDate,
              startTime,
              endTime,
              status: dto.status || 'PLANNED',
              room: dto.room?.trim() || null,
              notes: dto.notes?.trim() || null,
              recurrenceGroupId,
              recurrenceType: 'WEEKLY',
              recurrenceEndDate: endDate,
            },
            include: {
              classroom: { include: { grade: true } },
              subject: true,
              schoolYear: true,
              lessonPlan: {
                select: { id: true, title: true, status: true, objectives: true },
              },
            },
          }),
        ),
      );

      this.auditService?.log({
        actorUserId: teacherId,
        action: 'CREATE_RECURRING_SCHEDULE',
        resourceType: 'Schedule',
        resourceId: createdList[0].id,
        details: {
          recurrenceGroupId,
          totalOccurrences: createdList.length,
          title: dto.title,
          classroomId: dto.classroomId,
        },
      });

      return this.mapSchedule(createdList[0]);
    }

    // ─── Case B: Single Schedule (No recurrence) ──────────────────────────────
    await this.checkConflict({
      teacherId,
      classroomId: dto.classroomId,
      plannedDate: basePlannedDate,
      startTime,
      endTime,
      classroomName: classroom.name,
    });

    const schedule = await this.prisma.schedule.create({
      data: {
        teacherId,
        classroomId: dto.classroomId,
        subjectId: dto.subjectId,
        schoolYearId,
        lessonPlanId: dto.lessonPlanId || null,
        title: dto.title.trim(),
        plannedDate: basePlannedDate,
        startTime,
        endTime,
        status: dto.status || 'PLANNED',
        room: dto.room?.trim() || null,
        notes: dto.notes?.trim() || null,
        recurrenceType: 'NONE',
      },
      include: {
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
        lessonPlan: {
          select: { id: true, title: true, status: true, objectives: true },
        },
      },
    });

    this.auditService?.log({
      actorUserId: teacherId,
      action: 'CREATE_SCHEDULE',
      resourceType: 'Schedule',
      resourceId: schedule.id,
      details: {
        title: dto.title,
        classroomId: dto.classroomId,
        plannedDate: basePlannedDate.toISOString().split('T')[0],
        startTime,
        endTime,
      },
    });

    return this.mapSchedule(schedule);
  }

  async update(id: string, dto: UpdateScheduleDto, teacherId: string) {
    const existing = await this.prisma.schedule.findUnique({
      where: { id },
      include: { classroom: true },
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

    // Validate lessonPlanId if updating
    if (dto.lessonPlanId !== undefined) {
      if (dto.lessonPlanId) {
        const lp = await this.prisma.lessonPlan.findUnique({
          where: { id: dto.lessonPlanId },
        });
        if (!lp || lp.deletedAt || lp.teacherId !== teacherId) {
          throw new ForbiddenException('Giáo án không tồn tại hoặc không thuộc quyền sở hữu của bạn');
        }
      }
    }

    const isManual =
      dto.isManualStatus !== undefined
        ? dto.isManualStatus
        : dto.status !== undefined
          ? true
          : undefined;

    // ─── Case A: Update Recurring Series (THIS_AND_FUTURE or ALL) ──────────────
    if (existing.recurrenceGroupId && dto.recurrenceScope && dto.recurrenceScope !== 'THIS_ONLY') {
      const isThisAndFuture = dto.recurrenceScope === 'THIS_AND_FUTURE';
      const targetSchedules = await this.prisma.schedule.findMany({
        where: {
          recurrenceGroupId: existing.recurrenceGroupId,
          deletedAt: null,
          ...(isThisAndFuture ? { plannedDate: { gte: existing.plannedDate } } : {}),
        },
      });

      // Check conflicts for all affected occurrences
      for (const s of targetSchedules) {
        await this.checkConflict({
          teacherId,
          classroomId: existing.classroomId,
          plannedDate: s.plannedDate,
          startTime: startTime || s.startTime,
          endTime: endTime || s.endTime,
          excludeScheduleId: s.id,
          classroomName: existing.classroom.name,
        });
      }

      await this.prisma.$transaction(
        targetSchedules.map((s) =>
          this.prisma.schedule.update({
            where: { id: s.id },
            data: {
              title: dto.title?.trim(),
              status: dto.status,
              isManualStatus: isManual,
              room: dto.room?.trim(),
              startTime: dto.startTime,
              endTime: dto.endTime,
              notes: dto.notes?.trim(),
              postLessonNotes: dto.postLessonNotes?.trim(),
              lessonPlanId: dto.lessonPlanId !== undefined ? (dto.lessonPlanId || null) : undefined,
            },
          }),
        ),
      );

      const updated = await this.prisma.schedule.findUnique({
        where: { id },
        include: {
          classroom: { include: { grade: true } },
          subject: true,
          schoolYear: true,
          lessonPlan: {
            select: { id: true, title: true, status: true, objectives: true },
          },
        },
      });

      this.auditService?.log({
        actorUserId: teacherId,
        action: 'UPDATE_SCHEDULE_SERIES',
        resourceType: 'Schedule',
        resourceId: id,
        details: {
          recurrenceGroupId: existing.recurrenceGroupId,
          scope: dto.recurrenceScope,
          updatedCount: targetSchedules.length,
        },
      });

      return this.mapSchedule(updated!);
    }

    // ─── Case B: Single occurrence update ──────────────────────────────────────
    const targetDate = dto.plannedDate
      ? new Date(dto.plannedDate + 'T00:00:00')
      : existing.plannedDate;

    await this.checkConflict({
      teacherId,
      classroomId: existing.classroomId,
      plannedDate: targetDate,
      startTime: startTime || existing.startTime,
      endTime: endTime || existing.endTime,
      excludeScheduleId: id,
      classroomName: existing.classroom.name,
    });

    const updated = await this.prisma.schedule.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        status: dto.status,
        isManualStatus: isManual,
        room: dto.room?.trim(),
        plannedDate: dto.plannedDate ? new Date(dto.plannedDate + 'T00:00:00') : undefined,
        startTime: dto.startTime,
        endTime: dto.endTime,
        actualStartTime: dto.actualStartTime,
        actualEndTime: dto.actualEndTime,
        notes: dto.notes?.trim(),
        postLessonNotes: dto.postLessonNotes?.trim(),
        lessonPlanId: dto.lessonPlanId !== undefined ? (dto.lessonPlanId || null) : undefined,
      },
      include: {
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
        lessonPlan: {
          select: { id: true, title: true, status: true, objectives: true },
        },
      },
    });

    this.auditService?.log({
      actorUserId: teacherId,
      action: 'UPDATE_SCHEDULE',
      resourceType: 'Schedule',
      resourceId: id,
      details: {
        title: dto.title,
        status: dto.status,
        plannedDate: targetDate.toISOString().split('T')[0],
      },
    });

    return this.mapSchedule(updated);
  }

  async remove(
    id: string,
    teacherId: string,
    recurrenceScope: 'THIS_ONLY' | 'THIS_AND_FUTURE' | 'ALL' = 'THIS_ONLY',
  ) {
    const existing = await this.prisma.schedule.findUnique({
      where: { id },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Không tìm thấy lịch dạy ${id}`);
    }

    if (existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền xóa lịch dạy này');
    }

    if (existing.recurrenceGroupId && recurrenceScope !== 'THIS_ONLY') {
      if (recurrenceScope === 'THIS_AND_FUTURE') {
        const result = await this.prisma.schedule.deleteMany({
          where: {
            recurrenceGroupId: existing.recurrenceGroupId,
            plannedDate: { gte: existing.plannedDate },
          },
        });
        this.auditService?.log({
          actorUserId: teacherId,
          action: 'DELETE_SCHEDULE_SERIES',
          resourceType: 'Schedule',
          resourceId: id,
          details: { scope: 'THIS_AND_FUTURE', count: result.count },
        });
        return { success: true, message: `Đã xóa ${result.count} tiết dạy trong chuỗi` };
      } else if (recurrenceScope === 'ALL') {
        const result = await this.prisma.schedule.deleteMany({
          where: {
            recurrenceGroupId: existing.recurrenceGroupId,
          },
        });
        this.auditService?.log({
          actorUserId: teacherId,
          action: 'DELETE_SCHEDULE_SERIES',
          resourceType: 'Schedule',
          resourceId: id,
          details: { scope: 'ALL', count: result.count },
        });
        return { success: true, message: `Đã xóa toàn bộ ${result.count} tiết dạy trong chuỗi` };
      }
    }

    await this.prisma.schedule.delete({
      where: { id },
    });

    this.auditService?.log({
      actorUserId: teacherId,
      action: 'DELETE_SCHEDULE',
      resourceType: 'Schedule',
      resourceId: id,
      details: { title: existing.title },
    });

    return { success: true, message: 'Đã xóa lịch dạy thành công' };
  }

  async duplicate(id: string, dto: DuplicateScheduleDto, teacherId: string) {
    const existing = await this.prisma.schedule.findUnique({
      where: { id },
      include: { classroom: true, subject: true },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Không tìm thấy lịch dạy mẫu ${id}`);
    }

    if (existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền nhân bản lịch dạy này');
    }

    const targetClassroomId = dto.classroomId || existing.classroomId;
    const targetSubjectId = dto.subjectId || existing.subjectId;
    const targetTitle = dto.title?.trim() || existing.title;
    const targetStartTime = dto.startTime || existing.startTime;
    const targetEndTime = dto.endTime || existing.endTime;

    if (targetStartTime >= targetEndTime) {
      throw new BadRequestException('Giờ bắt đầu phải nhỏ hơn giờ kết thúc');
    }

    const targetDate = dto.plannedDate
      ? new Date(dto.plannedDate + 'T00:00:00')
      : new Date(existing.plannedDate);
    targetDate.setHours(0, 0, 0, 0);

    // Validate target classroom if changed
    if (targetClassroomId !== existing.classroomId) {
      const cls = await this.prisma.classroom.findUnique({
        where: { id: targetClassroomId },
      });
      if (!cls || cls.deletedAt || cls.teacherId !== teacherId) {
        throw new ForbiddenException('Bạn không có quyền lên lịch cho lớp học này');
      }
    }

    // Check conflict
    await this.checkConflict({
      teacherId,
      classroomId: targetClassroomId,
      plannedDate: targetDate,
      startTime: targetStartTime,
      endTime: targetEndTime,
    });

    const duplicated = await this.prisma.schedule.create({
      data: {
        teacherId,
        classroomId: targetClassroomId,
        subjectId: targetSubjectId,
        schoolYearId: existing.schoolYearId,
        title: targetTitle,
        plannedDate: targetDate,
        startTime: targetStartTime,
        endTime: targetEndTime,
        status: 'PLANNED',
        isManualStatus: false,
        room: existing.room,
        notes: existing.notes,
        recurrenceType: 'NONE',
        lessonPlanId: existing.lessonPlanId,
      },
      include: {
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
        lessonPlan: {
          select: { id: true, title: true, status: true, objectives: true },
        },
      },
    });

    this.auditService?.log({
      actorUserId: teacherId,
      action: 'DUPLICATE_SCHEDULE',
      resourceType: 'Schedule',
      resourceId: duplicated.id,
      details: {
        originalId: id,
        newDate: targetDate.toISOString().split('T')[0],
        startTime: targetStartTime,
        endTime: targetEndTime,
      },
    });

    return this.mapSchedule(duplicated);
  }

  async updateStatus(id: string, dto: UpdateScheduleStatusDto, teacherId: string) {
    const existing = await this.prisma.schedule.findUnique({
      where: { id },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Không tìm thấy lịch dạy ${id}`);
    }

    if (existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền cập nhật trạng thái lịch dạy này');
    }

    const updated = await this.prisma.schedule.update({
      where: { id },
      data: {
        status: dto.status,
        isManualStatus: dto.isManualStatus !== undefined ? dto.isManualStatus : true,
        actualStartTime: dto.actualStartTime || undefined,
        actualEndTime: dto.actualEndTime || undefined,
        postLessonNotes: dto.postLessonNotes?.trim() || undefined,
      },
      include: {
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
        lessonPlan: {
          select: { id: true, title: true, status: true, objectives: true },
        },
      },
    });

    this.auditService?.log({
      actorUserId: teacherId,
      action: dto.status === 'CANCELLED' ? 'CANCEL_SCHEDULE' : 'UPDATE_SCHEDULE_STATUS',
      resourceType: 'Schedule',
      resourceId: id,
      details: { status: dto.status },
    });

    return this.mapSchedule(updated);
  }

  async linkLessonPlan(id: string, dto: LinkLessonPlanDto, teacherId: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
    });

    if (!schedule || schedule.deletedAt) {
      throw new NotFoundException(`Không tìm thấy lịch dạy ${id}`);
    }

    if (schedule.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền liên kết giáo án vào lịch dạy này');
    }

    const lp = await this.prisma.lessonPlan.findUnique({
      where: { id: dto.lessonPlanId },
    });

    if (!lp || lp.deletedAt || lp.teacherId !== teacherId) {
      throw new ForbiddenException('Giáo án không tồn tại hoặc không thuộc quyền sở hữu của bạn');
    }

    const updated = await this.prisma.schedule.update({
      where: { id },
      data: { lessonPlanId: dto.lessonPlanId },
      include: {
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
        lessonPlan: {
          select: { id: true, title: true, status: true, objectives: true },
        },
      },
    });

    this.auditService?.log({
      actorUserId: teacherId,
      action: 'LINK_LESSON_PLAN',
      resourceType: 'Schedule',
      resourceId: id,
      details: { lessonPlanId: dto.lessonPlanId },
    });

    return this.mapSchedule(updated);
  }

  async unlinkLessonPlan(id: string, teacherId: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
    });

    if (!schedule || schedule.deletedAt) {
      throw new NotFoundException(`Không tìm thấy lịch dạy ${id}`);
    }

    if (schedule.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền gỡ giáo án khỏi lịch dạy này');
    }

    const updated = await this.prisma.schedule.update({
      where: { id },
      data: { lessonPlanId: null },
      include: {
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
      },
    });

    this.auditService?.log({
      actorUserId: teacherId,
      action: 'UNLINK_LESSON_PLAN',
      resourceType: 'Schedule',
      resourceId: id,
    });

    return this.mapSchedule(updated);
  }

  async getScheduleAttendance(id: string, teacherId: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
      include: { classroom: true },
    });

    if (!schedule || schedule.deletedAt) {
      throw new NotFoundException(`Không tìm thấy lịch dạy ${id}`);
    }

    if (schedule.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập điểm danh của lịch dạy này');
    }

    const targetDate = new Date(schedule.plannedDate);
    targetDate.setHours(0, 0, 0, 0);

    const session = await this.prisma.attendanceSession.findUnique({
      where: {
        classroomId_attendanceDate: {
          classroomId: schedule.classroomId,
          attendanceDate: targetDate,
        },
      },
      include: {
        attendances: true,
      },
    });

    if (!session) {
      return {
        scheduleId: id,
        classroomId: schedule.classroomId,
        className: schedule.classroom.name,
        date: targetDate.toISOString().split('T')[0],
        isRecorded: false,
        sessionId: null,
      };
    }

    return {
      scheduleId: id,
      classroomId: schedule.classroomId,
      className: schedule.classroom.name,
      date: targetDate.toISOString().split('T')[0],
      isRecorded: true,
      sessionId: session.id,
      status: session.status,
      totalStudents: session.attendances.length,
      presentCount: session.attendances.filter((a) => a.status === 'PRESENT').length,
      absentCount: session.attendances.filter((a) => a.status === 'EXCUSED_ABSENCE' || a.status === 'UNEXCUSED_ABSENCE').length,
      lateCount: session.attendances.filter((a) => a.status === 'LATE').length,
    };
  }

  private mapSchedule(s: any) {
    return {
      id: s.id,
      teacherId: s.teacherId,
      title: s.title,
      status: s.status || 'PLANNED',
      isManualStatus: Boolean(s.isManualStatus),
      room: s.room || null,
      notes: s.notes || null,
      postLessonNotes: s.postLessonNotes || null,
      actualStartTime: s.actualStartTime || null,
      actualEndTime: s.actualEndTime || null,
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
      lessonPlanId: s.lessonPlanId || null,
      lessonPlan: s.lessonPlan
        ? {
            id: s.lessonPlan.id,
            title: s.lessonPlan.title,
            status: s.lessonPlan.status,
            objectives: s.lessonPlan.objectives || null,
          }
        : null,
      recurrenceGroupId: s.recurrenceGroupId || null,
      recurrenceType: s.recurrenceType || 'NONE',
      recurrenceEndDate: s.recurrenceEndDate
        ? s.recurrenceEndDate.toISOString().split('T')[0]
        : null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }
}
