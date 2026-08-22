import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';
import { SaveAttendanceDto, AttendanceStatusEnum } from './dto/save-attendance.dto';
import { SaveScheduleAttendanceDto } from './dto/save-schedule-attendance.dto';

function normalizeAttendanceStatus(status?: string): 'PRESENT' | 'EXCUSED_ABSENCE' | 'UNEXCUSED_ABSENCE' | 'LATE' {
  if (!status) return 'PRESENT';
  const s = status.toUpperCase();
  if (s === 'ABSENT' || s === 'VANG' || s === 'UNEXCUSED_ABSENCE') return 'UNEXCUSED_ABSENCE';
  if (s === 'EXCUSED' || s === 'PHEP' || s === 'EXCUSED_ABSENCE') return 'EXCUSED_ABSENCE';
  if (s === 'LATE' || s === 'MUON') return 'LATE';
  return 'PRESENT';
}

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private assignmentAuth: TeachingAssignmentAuthorizationService,
    @Optional() private auditService?: AuditService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // SCHEDULE-BASED ATTENDANCE
  // ═══════════════════════════════════════════════════════════════════════════

  async getScheduleAttendance(scheduleId: string, teacherId?: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        classroom: { include: { grade: true } },
        subject: true,
      },
    });

    if (!schedule || schedule.deletedAt) {
      throw new NotFoundException(`Không tìm thấy tiết dạy với mã ${scheduleId}`);
    }

    if (teacherId && schedule.teacherId !== teacherId) {
      // Check if teacher has teaching assignment for this classroom
      await this.assignmentAuth.assertTeacherCanAccessClassroomAttendance(
        schedule.classroomId,
        teacherId,
      );
    }

    const targetDate = new Date(schedule.plannedDate);
    targetDate.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // 1. Fetch active students enrolled in this classroom on schedule's plannedDate
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        classroomId: schedule.classroomId,
        enrolledAt: { lte: endOfDay },
        OR: [
          { leftAt: null },
          { leftAt: { gte: targetDate } },
        ],
        status: { in: ['ACTIVE', 'TRANSFERRED', 'COMPLETED'] },
        student: { deletedAt: null },
      },
      include: { student: true },
      orderBy: { student: { fullName: 'asc' } },
    });

    // 2. Fetch existing AttendanceSession linked to this schedule
    const session = await this.prisma.attendanceSession.findUnique({
      where: { scheduleId },
      include: { attendances: true },
    });

    const attendanceMap = new Map(
      session?.attendances.map((a) => [a.studentId, a]) || [],
    );

    const students = enrollments.map((enr) => {
      const s = enr.student;
      const att = attendanceMap.get(s.id);
      return {
        studentId: s.id,
        name: s.fullName,
        initials: s.initials || s.fullName.slice(0, 2).toUpperCase(),
        gender: s.gender === 'FEMALE' ? 'Nữ' : 'Nam',
        status: att?.status || 'PRESENT',
        lateMinutes: att?.lateMinutes || 0,
        note: att?.note || '',
      };
    });

    const presentCount = students.filter((s) => s.status === 'PRESENT').length;
    const excusedCount = students.filter((s) => s.status === 'EXCUSED_ABSENCE').length;
    const unexcusedCount = students.filter((s) => s.status === 'UNEXCUSED_ABSENCE').length;
    const lateCount = students.filter((s) => s.status === 'LATE').length;

    return {
      schedule: {
        id: schedule.id,
        title: schedule.title,
        plannedDate: schedule.plannedDate.toISOString().split('T')[0],
        startTime: schedule.startTime || '07:00',
        endTime: schedule.endTime || '07:45',
        classroomId: schedule.classroomId,
        className: schedule.classroom?.name || 'Lớp học',
        subjectId: schedule.subjectId,
        subjectName: schedule.subjectName || schedule.subject?.name || 'Môn học',
        room: schedule.room || schedule.classroom?.room || 'Phòng học',
      },
      isRecorded: !!session,
      sessionId: session?.id || null,
      note: session?.note || '',
      summary: {
        totalStudents: students.length,
        presentCount,
        excusedCount,
        unexcusedCount,
        lateCount,
        absentCount: excusedCount + unexcusedCount,
      },
      students,
    };
  }

  async saveScheduleAttendance(
    scheduleId: string,
    dto: SaveScheduleAttendanceDto,
    teacherId: string,
  ) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        classroom: { include: { schoolYear: true } },
        subject: true,
      },
    });

    if (!schedule || schedule.deletedAt) {
      throw new NotFoundException(`Không tìm thấy tiết dạy với mã ${scheduleId}`);
    }

    if (schedule.teacherId !== teacherId) {
      await this.assignmentAuth.assertTeacherCanAccessClassroomAttendance(
        schedule.classroomId,
        teacherId,
      );
    }

    if (schedule.classroom?.schoolYear && !schedule.classroom.schoolYear.isActive) {
      throw new BadRequestException('Không thể điểm danh cho lớp thuộc năm học đã kết thúc');
    }

    // Validate duplicate student IDs in submitted payload
    const studentIds = dto.attendances.map((a) => a.studentId);
    const uniqueIds = new Set(studentIds);
    if (uniqueIds.size !== studentIds.length) {
      throw new BadRequestException('Dữ liệu điểm danh chứa học sinh bị trùng lặp');
    }

    const targetDate = new Date(schedule.plannedDate);
    targetDate.setHours(0, 0, 0, 0);

    // Validate that all students belong to the classroom enrollment
    if (studentIds.length > 0) {
      await this.assignmentAuth.assertStudentsEnrolled(
        schedule.classroomId,
        studentIds,
        targetDate,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let session = await tx.attendanceSession.findUnique({
        where: { scheduleId },
      });

      const normalizedAttendances = dto.attendances.map((a) => ({
        studentId: a.studentId,
        status: normalizeAttendanceStatus(a.status),
        lateMinutes: a.status === 'LATE' || normalizeAttendanceStatus(a.status) === 'LATE' ? Math.max(0, a.lateMinutes || 5) : 0,
        note: a.note?.trim() || null,
      }));

      const presentCount = normalizedAttendances.filter((a) => a.status === 'PRESENT').length;
      const excusedCount = normalizedAttendances.filter((a) => a.status === 'EXCUSED_ABSENCE').length;
      const unexcusedCount = normalizedAttendances.filter((a) => a.status === 'UNEXCUSED_ABSENCE').length;
      const lateCount = normalizedAttendances.filter((a) => a.status === 'LATE').length;
      const totalStudents = normalizedAttendances.length;

      const title = `${schedule.title} · ${schedule.classroom.name}`;
      const meta = `${presentCount}/${totalStudents} có mặt · ${excusedCount + unexcusedCount} vắng · ${lateCount} muộn`;

      if (!session) {
        session = await tx.attendanceSession.create({
          data: {
            scheduleId,
            classroomId: schedule.classroomId,
            teacherId,
            attendanceDate: targetDate,
            sessionPeriod: schedule.startTime < '12:00' ? 'MORNING' : 'AFTERNOON',
            title,
            meta,
            note: dto.note?.trim() || null,
            status: 'Đã điểm danh',
            completedAt: new Date(),
          },
        });
      } else {
        session = await tx.attendanceSession.update({
          where: { id: session.id },
          data: {
            title,
            meta,
            note: dto.note?.trim() || null,
            status: 'Đã điểm danh',
            completedAt: new Date(),
          },
        });
      }

      // Upsert individual student records in batch
      for (const item of normalizedAttendances) {
        await tx.studentAttendance.upsert({
          where: {
            attendanceSessionId_studentId: {
              attendanceSessionId: session.id,
              studentId: item.studentId,
            },
          },
          update: {
            status: item.status,
            lateMinutes: item.lateMinutes,
            note: item.note,
          },
          create: {
            attendanceSessionId: session.id,
            studentId: item.studentId,
            status: item.status,
            lateMinutes: item.lateMinutes,
            note: item.note,
          },
        });
      }

      this.auditService?.log({
        actorUserId: teacherId,
        action: 'ATTENDANCE_SAVE',
        resourceType: 'AttendanceSession',
        resourceId: session.id,
        details: {
          scheduleId,
          presentCount,
          absentCount: excusedCount + unexcusedCount,
          lateCount,
          totalStudents,
        },
      });

      return {
        success: true,
        message: 'Lưu điểm danh thành công',
        sessionId: session.id,
        summary: {
          totalStudents,
          presentCount,
          excusedCount,
          unexcusedCount,
          lateCount,
          absentCount: excusedCount + unexcusedCount,
        },
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STUDENT ATTENDANCE HISTORY & AGGREGATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async getStudentAttendanceSummary(studentId: string, teacherId?: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        studentEnrollments: {
          where: { status: 'ACTIVE' },
          include: { classroom: true },
        },
      },
    });

    if (!student || student.deletedAt) {
      throw new NotFoundException(`Không tìm thấy học sinh với mã ${studentId}`);
    }

    const records = await this.prisma.studentAttendance.findMany({
      where: { studentId },
      include: {
        attendanceSession: {
          include: {
            schedule: {
              include: { subject: true },
            },
            classroom: true,
          },
        },
      },
      orderBy: { attendanceSession: { attendanceDate: 'desc' } },
      take: 30,
    });

    let presentCount = 0;
    let excusedCount = 0;
    let unexcusedCount = 0;
    let lateCount = 0;

    for (const r of records) {
      if (r.status === 'PRESENT') presentCount++;
      else if (r.status === 'EXCUSED_ABSENCE') excusedCount++;
      else if (r.status === 'UNEXCUSED_ABSENCE') unexcusedCount++;
      else if (r.status === 'LATE') lateCount++;
    }

    const totalPeriods = records.length;
    const attendanceRate =
      totalPeriods > 0
        ? Math.round(((presentCount + lateCount) / totalPeriods) * 100)
        : 100;

    return {
      studentId: student.id,
      studentName: student.fullName,
      classroom: student.studentEnrollments[0]?.classroom?.name || null,
      summary: {
        totalPeriods,
        presentCount,
        excusedCount,
        unexcusedCount,
        lateCount,
        absentCount: excusedCount + unexcusedCount,
        attendanceRate,
      },
      recentLogs: records.map((r) => ({
        id: r.id,
        date: r.attendanceSession.attendanceDate.toISOString().split('T')[0],
        subjectName: r.attendanceSession.schedule?.subjectName || r.attendanceSession.schedule?.subject?.name || r.attendanceSession.title || 'Tiết học',
        startTime: r.attendanceSession.schedule?.startTime || '07:00',
        endTime: r.attendanceSession.schedule?.endTime || '07:45',
        status: r.status,
        lateMinutes: r.lateMinutes || 0,
        note: r.note || '',
      })),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASSROOM STATS
  // ═══════════════════════════════════════════════════════════════════════════

  async getAttendanceStats(
    teacherId: string,
    query?: { classId?: string; dateFrom?: string; dateTo?: string },
  ) {
    const where: any = {
      teacherId,
    };

    if (query?.classId && query.classId !== 'Tất cả') {
      where.classroomId = query.classId;
    }

    if (query?.dateFrom && query?.dateTo) {
      where.attendanceDate = {
        gte: new Date(query.dateFrom),
        lte: new Date(query.dateTo),
      };
    }

    const sessions = await this.prisma.attendanceSession.findMany({
      where,
      include: {
        attendances: true,
        classroom: true,
      },
      orderBy: { attendanceDate: 'desc' },
    });

    let totalRecorded = 0;
    let presentCount = 0;
    let excusedCount = 0;
    let unexcusedCount = 0;
    let lateCount = 0;

    for (const s of sessions) {
      for (const a of s.attendances) {
        totalRecorded++;
        if (a.status === 'PRESENT') presentCount++;
        else if (a.status === 'EXCUSED_ABSENCE') excusedCount++;
        else if (a.status === 'UNEXCUSED_ABSENCE') unexcusedCount++;
        else if (a.status === 'LATE') lateCount++;
      }
    }

    const overallRate =
      totalRecorded > 0
        ? Math.round(((presentCount + lateCount) / totalRecorded) * 100)
        : 100;

    return {
      totalSessions: sessions.length,
      totalRecorded,
      presentCount,
      excusedCount,
      unexcusedCount,
      lateCount,
      absentCount: excusedCount + unexcusedCount,
      overallRate,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DAILY / HOMEROOM ATTENDANCE (LEGACY COMPATIBLE)
  // ═══════════════════════════════════════════════════════════════════════════

  async getAttendance(classId: string, dateStr: string, teacherId?: string) {
    if (!classId) {
      const defaultClass = await this.prisma.classroom.findFirst({
        where: teacherId ? { teacherId, deletedAt: null } : { deletedAt: null },
      });
      if (!defaultClass) {
        throw new NotFoundException('Không tìm thấy lớp học');
      }
      classId = defaultClass.id;
    }

    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classId },
    });

    if (!classroom || classroom.deletedAt) {
      throw new NotFoundException('Lớp học không tồn tại');
    }

    if (teacherId) {
      await this.assignmentAuth.assertTeacherCanAccessClassroomAttendance(classId, teacherId);
    }

    const targetDate = dateStr ? new Date(dateStr) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        classroomId: classId,
        enrolledAt: { lte: endOfDay },
        OR: [
          { leftAt: null },
          { leftAt: { gte: targetDate } },
        ],
        status: { in: ['ACTIVE', 'TRANSFERRED', 'COMPLETED'] },
        student: { deletedAt: null },
      },
      include: { student: true },
      orderBy: { student: { fullName: 'asc' } },
    });

    const session = await this.prisma.attendanceSession.findFirst({
      where: {
        classroomId: classId,
        attendanceDate: targetDate,
        scheduleId: null,
      },
      include: {
        attendances: true,
      },
    });

    const attendanceMap = new Map(
      session?.attendances.map((a) => [a.studentId, a]) || [],
    );

    const students = enrollments.map((enr) => {
      const s = enr.student;
      const att = attendanceMap.get(s.id);
      return {
        studentId: s.id,
        name: s.fullName,
        initials: s.initials || s.fullName.slice(0, 2).toUpperCase(),
        gender: s.gender === 'FEMALE' ? 'Nữ' : 'Nam',
        status: att?.status || AttendanceStatusEnum.PRESENT,
        lateMinutes: att?.lateMinutes || 0,
        note: att?.note || 'Đúng giờ',
      };
    });

    return {
      classId: classroom.id,
      className: classroom.name,
      date: targetDate.toISOString().split('T')[0],
      isRecorded: !!session,
      totalStudents: students.length,
      presentCount: students.filter((s) => s.status === 'PRESENT').length,
      absentCount: students.filter(
        (s) => s.status === 'EXCUSED_ABSENCE' || s.status === 'UNEXCUSED_ABSENCE',
      ).length,
      lateCount: students.filter((s) => s.status === 'LATE').length,
      students,
    };
  }

  async saveAttendance(dto: SaveAttendanceDto, teacherId: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: dto.classId },
      include: { schoolYear: true },
    });

    if (!classroom || classroom.deletedAt) {
      throw new NotFoundException('Lớp học không tồn tại');
    }

    if (classroom.schoolYear && !classroom.schoolYear.isActive) {
      throw new BadRequestException('Không thể điểm danh cho lớp học thuộc năm học đã ngừng hoạt động');
    }

    await this.assignmentAuth.assertTeacherCanAccessClassroomAttendance(dto.classId, teacherId);

    const targetDate = new Date(dto.date);
    targetDate.setHours(0, 0, 0, 0);

    const now = new Date();
    const maxAllowedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59);
    if (targetDate > maxAllowedDate) {
      throw new BadRequestException('Không thể điểm danh cho ngày trong tương lai');
    }

    await this.assignmentAuth.assertStudentsEnrolled(
      dto.classId,
      dto.attendances.map((a) => a.studentId),
      targetDate,
    );

    const assignment = await this.prisma.teachingAssignment.findFirst({
      where: { teacherId, classroomId: dto.classId, isActive: true },
    });

    return this.prisma.$transaction(async (tx) => {
      let session = await tx.attendanceSession.findFirst({
        where: {
          classroomId: dto.classId,
          attendanceDate: targetDate,
          scheduleId: null,
        },
      });

      const presentCount = dto.attendances.filter((a) => normalizeAttendanceStatus(a.status) === 'PRESENT').length;
      const absentCount = dto.attendances.filter((a) => normalizeAttendanceStatus(a.status) === 'EXCUSED_ABSENCE' || normalizeAttendanceStatus(a.status) === 'UNEXCUSED_ABSENCE').length;

      const title = `${classroom.name} · ${targetDate.toLocaleDateString('vi-VN')}`;
      const meta = `${presentCount} có mặt · ${absentCount} vắng`;

      if (!session) {
        session = await tx.attendanceSession.create({
          data: {
            classroomId: dto.classId,
            teacherId,
            teachingAssignmentId: assignment?.id || null,
            attendanceDate: targetDate,
            sessionPeriod: dto.sessionPeriod || 'MORNING',
            title,
            meta,
            status: 'Đã điểm danh',
            completedAt: new Date(),
          },
        });
      } else {
        session = await tx.attendanceSession.update({
          where: { id: session.id },
          data: {
            title,
            meta,
            status: 'Đã điểm danh',
            completedAt: new Date(),
          },
        });
      }

      for (const item of dto.attendances) {
        const normStatus = normalizeAttendanceStatus(item.status);
        await tx.studentAttendance.upsert({
          where: {
            attendanceSessionId_studentId: {
              attendanceSessionId: session.id,
              studentId: item.studentId,
            },
          },
          update: {
            status: normStatus,
            note: item.note,
          },
          create: {
            attendanceSessionId: session.id,
            studentId: item.studentId,
            status: normStatus,
            note: item.note,
          },
        });
      }

      return {
        success: true,
        message: 'Lưu điểm danh thành công',
        sessionId: session.id,
      };
    });
  }

  async getHistory(teacherId?: string) {
    const where: any = {};
    if (teacherId) {
      where.OR = [
        { teacherId },
        { classroom: { teacherId } },
        { teachingAssignment: { teacherId } },
      ];
    }

    const sessions = await this.prisma.attendanceSession.findMany({
      where,
      include: {
        classroom: true,
        attendances: true,
      },
      orderBy: { attendanceDate: 'desc' },
      take: 20,
    });

    return sessions.map((s) => ({
      id: s.id,
      title: s.title || `${s.classroom.name} · ${new Date(s.attendanceDate).toLocaleDateString('vi-VN')}`,
      subtitle: s.sessionPeriod === 'AFTERNOON' ? 'Buổi chiều' : 'Buổi sáng',
      status: s.status || 'Đã điểm danh',
      meta: s.meta || `${s.attendances.length} học sinh`,
      tone: s.tone || 'teal',
    }));
  }
}
