import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HOMEROOM_RULES } from './homeroom.constants';
import { CreateBehaviorRecordDto } from './dto/create-behavior.dto';
import { UpdateBehaviorRecordDto } from './dto/update-behavior.dto';
import { QueryBehaviorDto } from './dto/query-behavior.dto';
import { SaveWeeklyReviewDto } from './dto/save-weekly-review.dto';
import { SaveMonthlyReviewDto } from './dto/save-monthly-review.dto';
import {
  HomeroomExportService,
  WeeklyReviewExportData,
  MonthlySummaryExportData,
} from '../export/homeroom-export.service';
import { sanitizeFilename } from '../export/export.utils';
import { AuditService } from '../common/audit/audit.service';
import { CreateHomeroomTaskDto, UpdateHomeroomTaskDto } from './dto/homeroom-task.dto';
import { CreateParentContactDto, UpdateParentContactDto } from './dto/parent-contact.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class HomeroomService {
  private readonly logger = new Logger(HomeroomService.name);

  constructor(
    private prisma: PrismaService,
    private homeroomExportService: HomeroomExportService,
    @Optional() private auditService?: AuditService,
  ) {}

  private dateOnly(value: string | Date) {
    let raw: string;
    if (typeof value === 'string') {
      raw = value.slice(0, 10);
    } else {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(value);
      const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((item) => item.type === type)?.value;
      raw = `${part('year')}-${part('month')}-${part('day')}`;
    }
    return new Date(`${raw}T00:00:00.000Z`);
  }

  async getMyHomerooms(teacherId: string) {
    const classrooms = await this.prisma.classroom.findMany({
      where: {
        homeroomTeacherId: teacherId,
        deletedAt: null,
        isActive: true,
        schoolYear: { isActive: true, isCurrent: true },
      },
      include: { grade: true, schoolYear: true },
      orderBy: [{ schoolYear: { startDate: 'desc' } }, { name: 'asc' }],
    });

    return {
      hasHomeroomClass: classrooms.length > 0,
      classes: classrooms.map((classroom) => ({
        id: classroom.id,
        code: classroom.code,
        name: classroom.name,
        gradeName: classroom.grade.name,
        gradeLevel: classroom.grade.level,
        schoolYearId: classroom.schoolYearId,
        schoolYearName: classroom.schoolYear.name,
      })),
    };
  }

  /**
   * Validate Classroom exists, not deleted, and belongs to currentTeacherId
   */
  async getHomeroomClassOrThrow(classroomId: string, teacherId: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      include: {
        schoolYear: true,
        grade: true,
        homeroomTeacher: true,
      },
    });

    if (!classroom || classroom.deletedAt) {
      throw new NotFoundException('Không tìm thấy lớp học');
    }

    if (
      classroom.homeroomTeacherId !== teacherId ||
      classroom.isActive === false ||
      classroom.schoolYear?.isActive === false ||
      classroom.schoolYear?.isCurrent === false
    ) {
      throw new ForbiddenException('Bạn không có quyền truy cập lớp học này');
    }

    return classroom;
  }

  async validateClassroomOwnership(classroomId: string, teacherId: string) {
    return this.getHomeroomClassOrThrow(classroomId, teacherId);
  }

  /**
   * Validate Student is active in active ClassStudent and belongs to teacher's class
   */
  async validateStudentInClassroom(studentId: string, classroomId: string, teacherId: string) {
    await this.validateClassroomOwnership(classroomId, teacherId);

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student || student.deletedAt) {
      throw new NotFoundException('Không tìm thấy học sinh');
    }

    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: { classroomId, studentId, status: 'ACTIVE' },
    });

    if (!enrollment) {
      throw new ForbiddenException('Học sinh không thuộc lớp học này hoặc đã thôi học');
    }

    return student;
  }

  /**
   * Homeroom Dashboard Aggregator
   */
  async getDashboard(classId: string | undefined, teacherId: string) {
    let classroomId = classId;
    if (!classroomId) {
      return {
        hasHomeroomClass: false,
        classroom: null,
        studentCount: 0,
        attendanceToday: {
          isRecorded: false,
          total: 0,
          present: 0,
          excusedAbsence: 0,
          unexcusedAbsence: 0,
          late: 0,
        },
        students: [],
        studentsNeedAttention: [],
        upcomingBirthdays: [],
        recentBehavior: [],
        recentEvents: [],
        weeklyTasks: [],
        currentWeekReview: null,
      };
    }

    const classroom = await this.validateClassroomOwnership(classroomId, teacherId);

    // Active roster is returned with the dashboard so every student can be
    // selected when the homeroom teacher creates a behavior record.
    const activeEnrollmentWhere = {
      classroomId,
      status: 'ACTIVE' as const,
      student: { deletedAt: null },
    };
    const [studentCount, activeEnrollments] = await Promise.all([
      this.prisma.studentEnrollment.count({ where: activeEnrollmentWhere }),
      this.prisma.studentEnrollment.findMany({
        where: activeEnrollmentWhere,
        select: {
          student: {
            select: { id: true, fullName: true, initials: true, avatarColor: true },
          },
        },
        orderBy: { student: { fullName: 'asc' } },
      }),
    ]);

    // Attendance Today
    const today = this.dateOnly(new Date());

    const sessionsToday = await this.prisma.attendanceSession.findMany({
      where: {
        classroomId,
        attendanceDate: today,
      },
      include: {
        attendances: true,
      },
    });

    const attendances = sessionsToday.flatMap((session) => session.attendances);
    const attendanceToday = {
      isRecorded: sessionsToday.length > 0,
      sessionCount: sessionsToday.length,
      total: studentCount,
      present: attendances.filter((a) => a.status === 'PRESENT').length,
      excusedAbsence: attendances.filter((a) => a.status === 'EXCUSED_ABSENCE').length,
      unexcusedAbsence: attendances.filter((a) => a.status === 'UNEXCUSED_ABSENCE').length,
      late: attendances.filter((a) => a.status === 'LATE').length,
    };

    // Sub-widgets
    const studentsNeedAttention = await this.getStudentsNeedAttention(classroomId, teacherId);
    const upcomingBirthdays = await this.getUpcomingBirthdays(classroomId, teacherId, HOMEROOM_RULES.DEFAULT_BIRTHDAY_DAYS);

    // Recent behavior records (top 5)
    const recentBehavior = await this.prisma.studentBehaviorRecord.findMany({
      where: { classroomId },
      include: {
        student: { select: { id: true, fullName: true, avatarColor: true, initials: true } },
      },
      orderBy: { recordDate: 'desc' },
      take: 5,
    });

    // Weekly tasks
    const tasks = await this.prisma.teacherTask.findMany({
      where: { teacherId, classroomId },
      orderBy: [{ done: 'asc' }, { dueDate: 'asc' }],
      take: 5,
    });

    // Current week review (latest)
    const currentWeekReview = await this.prisma.weeklyClassReview.findFirst({
      where: { classroomId, teacherId, schoolYearId: classroom.schoolYearId },
      orderBy: { weekNumber: 'desc' },
    });

    return {
      hasHomeroomClass: true,
      classroom: {
        id: classroom.id,
        name: classroom.name,
        room: classroom.room,
        schedule: classroom.schedule,
        accent: classroom.accent || 'teal',
        studentCount,
        gradeName: classroom.grade?.name ?? null,
        schoolYearName: classroom.schoolYear?.name ?? null,
        schoolYearId: classroom.schoolYearId,
      },
      attendanceToday,
      students: activeEnrollments.map(({ student }) => ({
        id: student.id,
        fullName: student.fullName,
        initials: student.initials,
        avatarColor: student.avatarColor,
      })),
      studentsNeedAttention,
      upcomingBirthdays,
      recentBehavior: recentBehavior.map((b) => ({
        id: b.id,
        studentId: b.studentId,
        studentName: b.student.fullName,
        studentInitials: b.student.initials,
        studentColor: b.student.avatarColor,
        recordDate: b.recordDate.toISOString().split('T')[0],
        category: b.category,
        level: b.level,
        content: b.content,
      })),
      weeklyTasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        due: t.dueDate,
        done: t.done,
        status: t.status,
        priority: t.priority,
      })),
      currentWeekReview: currentWeekReview
        ? {
            id: currentWeekReview.id,
            weekNumber: currentWeekReview.weekNumber,
            strengths: currentWeekReview.strengths,
            limitations: currentWeekReview.limitations,
            nextWeekPlan: currentWeekReview.nextWeekPlan,
            version: currentWeekReview.version,
          }
        : null,
    };
  }

  /**
   * Rule-based detection for students needing attention
   * Only checks rolling 30-day window to prevent historical bias
   */
  async getStudentsNeedAttention(classroomId: string, teacherId: string) {
    await this.validateClassroomOwnership(classroomId, teacherId);

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - HOMEROOM_RULES.ATTENTION_WINDOW_DAYS);
    windowStart.setHours(0, 0, 0, 0);

    const classStudents = await this.prisma.studentEnrollment.findMany({
      where: {
        classroomId,
        status: 'ACTIVE',
        student: { deletedAt: null },
      },
      include: {
        student: {
          include: {
            studentAttendances: {
              where: {
                attendanceSession: {
                  classroomId,
                  attendanceDate: { gte: windowStart },
                },
              },
            },
            behaviorRecords: {
              where: {
                classroomId,
                recordDate: { gte: windowStart },
              },
            },
            studentAssessments: {
              where: {
                createdAt: { gte: windowStart },
              },
              include: {
                assessment: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
          },
        },
      },
    });

    const result: Array<{
      studentId: string;
      studentName: string;
      initials?: string | null;
      avatarColor?: string | null;
      reasons: Array<{ type: 'ATTENDANCE' | 'ASSESSMENT' | 'BEHAVIOR'; description: string }>;
    }> = [];

    for (const cs of classStudents) {
      const s = cs.student;
      const reasons: Array<{ type: 'ATTENDANCE' | 'ASSESSMENT' | 'BEHAVIOR'; description: string }> = [];

      // 1. Attendance checks
      const unexcusedCount = s.studentAttendances.filter((a) => a.status === 'UNEXCUSED_ABSENCE').length;
      if (unexcusedCount >= HOMEROOM_RULES.UNEXCUSED_ABSENCE_THRESHOLD) {
        reasons.push({
          type: 'ATTENDANCE',
          description: `Nghỉ không phép ${unexcusedCount} buổi trong 30 ngày qua`,
        });
      }

      const lateCount = s.studentAttendances.filter((a) => a.status === 'LATE').length;
      if (lateCount >= HOMEROOM_RULES.LATE_THRESHOLD) {
        reasons.push({
          type: 'ATTENDANCE',
          description: `Đi muộn ${lateCount} lần trong 30 ngày qua`,
        });
      }

      // 2. Assessment checks (recent needs support)
      const needsSupportAssessments = s.studentAssessments.filter((a) => a.level === 'NEEDS_SUPPORT');
      if (needsSupportAssessments.length > 0) {
        const subjects = Array.from(new Set(needsSupportAssessments.map((a) => a.assessment?.title || 'Đánh giá'))).slice(0, 2);
        reasons.push({
          type: 'ASSESSMENT',
          description: `Có nội dung học tập cần hỗ trợ (${subjects.join(', ')})`,
        });
      }

      // 3. Behavior checks
      const attentionBehaviors = s.behaviorRecords.filter((b) => b.level === 'NEEDS_ATTENTION');
      if (attentionBehaviors.length > 0) {
        reasons.push({
          type: 'BEHAVIOR',
          description: `Có ${attentionBehaviors.length} ghi nhận nề nếp cần quan tâm đặc biệt`,
        });
      }

      const reminderBehaviors = s.behaviorRecords.filter((b) => b.level === 'REMINDER');
      if (reminderBehaviors.length >= HOMEROOM_RULES.BEHAVIOR_REMINDER_THRESHOLD) {
        reasons.push({
          type: 'BEHAVIOR',
          description: `Bị nhắc nhở nề nếp ${reminderBehaviors.length} lần trong tháng`,
        });
      }

      if (reasons.length > 0) {
        result.push({
          studentId: s.id,
          studentName: s.fullName,
          initials: s.initials,
          avatarColor: s.avatarColor,
          reasons,
        });
      }
    }

    return result.sort((a, b) => b.reasons.length - a.reasons.length);
  }

  /**
   * Upcoming birthdays within next `days`
   * Handles leap year (Feb 29) & year-end boundary (Dec -> Jan)
   */
  async getUpcomingBirthdays(classroomId: string, teacherId: string, days = 30) {
    if (!Number.isInteger(days) || days < 1 || days > 366) {
      throw new BadRequestException('Số ngày tra cứu sinh nhật phải từ 1 đến 366');
    }
    await this.validateClassroomOwnership(classroomId, teacherId);

    const classStudents = await this.prisma.studentEnrollment.findMany({
      where: {
        classroomId,
        status: 'ACTIVE',
        student: { deletedAt: null },
      },
      include: {
        student: true,
      },
    });

    const now = new Date();
    const currentYear = now.getFullYear();
    const todayMidnight = new Date(currentYear, now.getMonth(), now.getDate());

    const birthdays: Array<{
      studentId: string;
      fullName: string;
      initials?: string | null;
      avatarColor?: string | null;
      dateOfBirth: string;
      daysUntilBirthday: number;
      isToday: boolean;
      turningAge: number;
    }> = [];

    for (const cs of classStudents) {
      const s = cs.student;
      let birthDate: Date | null = null;

      if (s.dateOfBirth) {
        birthDate = new Date(s.dateOfBirth);
      } else if (s.dobString) {
        // Parse "DD/MM/YYYY" or "YYYY-MM-DD"
        const parts = s.dobString.includes('/') ? s.dobString.split('/') : s.dobString.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            birthDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          } else {
            birthDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
          }
        }
      }

      if (!birthDate || isNaN(birthDate.getTime())) continue;

      const birthMonth = birthDate.getMonth();
      const birthDay = birthDate.getDate();
      const birthYear = birthDate.getFullYear();

      // Determine next birthday
      let nextBirthday = new Date(currentYear, birthMonth, birthDay);

      // Handle leap year for Feb 29 in non-leap year
      if (birthMonth === 1 && birthDay === 29) {
        const isLeap = (currentYear % 4 === 0 && currentYear % 100 !== 0) || currentYear % 400 === 0;
        if (!isLeap) {
          nextBirthday = new Date(currentYear, 1, 28);
        }
      }

      if (nextBirthday < todayMidnight) {
        // Birthday already passed this year -> next year
        nextBirthday = new Date(currentYear + 1, birthMonth, birthDay);
      }

      const diffTime = nextBirthday.getTime() - todayMidnight.getTime();
      const daysUntil = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (daysUntil >= 0 && daysUntil <= days) {
        birthdays.push({
          studentId: s.id,
          fullName: s.fullName,
          initials: s.initials,
          avatarColor: s.avatarColor,
          dateOfBirth: `${birthDay.toString().padStart(2, '0')}/${(birthMonth + 1).toString().padStart(2, '0')}/${birthYear}`,
          daysUntilBirthday: daysUntil,
          isToday: daysUntil === 0,
          turningAge: nextBirthday.getFullYear() - birthYear,
        });
      }
    }

    return birthdays.sort((a, b) => a.daysUntilBirthday - b.daysUntilBirthday);
  }

  /**
   * Behavior Records CRUD
   */
  async getBehaviorRecords(query: QueryBehaviorDto, teacherId: string) {
    const where: any = {
      teacherId,
      classroom: {
        homeroomTeacherId: teacherId,
        deletedAt: null,
        isActive: true,
        schoolYear: { isActive: true },
      },
    };

    if (query.classId) {
      await this.validateClassroomOwnership(query.classId, teacherId);
      where.classroomId = query.classId;
    }

    if (query.studentId) {
      where.studentId = query.studentId;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.behaviorType) {
      where.behaviorType = query.behaviorType;
    }

    if (query.level) {
      where.level = query.level;
    }

    if (query.fromDate || query.toDate) {
      where.recordDate = {};
      if (query.fromDate) {
        where.recordDate.gte = new Date(query.fromDate);
      }
      if (query.toDate) {
        const to = new Date(query.toDate);
        to.setHours(23, 59, 59, 999);
        where.recordDate.lte = to;
      }
    }

    if (query.search) {
      where.OR = [
        { content: { contains: query.search, mode: 'insensitive' } },
        { student: { fullName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const page = Math.max(1, query.page || 1);
    const pageSize = Math.max(1, query.pageSize || 10);
    const skip = (page - 1) * pageSize;

    const [total, records] = await Promise.all([
      this.prisma.studentBehaviorRecord.count({ where }),
      this.prisma.studentBehaviorRecord.findMany({
        where,
        include: {
          student: {
            select: { id: true, fullName: true, initials: true, avatarColor: true },
          },
          classroom: {
            select: { id: true, name: true },
          },
        },
        orderBy: { recordDate: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return {
      data: records.map((r) => ({
        id: r.id,
        classroomId: r.classroomId,
        className: r.classroom.name,
        studentId: r.studentId,
        studentName: r.student.fullName,
        studentInitials: r.student.initials,
        studentColor: r.student.avatarColor,
        recordDate: r.recordDate.toISOString().split('T')[0],
        category: r.category,
        behaviorType: r.behaviorType,
        level: r.level,
        content: r.content,
        resolution: r.resolution,
        note: r.note,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async createBehaviorRecord(dto: CreateBehaviorRecordDto, teacherId: string) {
    // Validate scope: classroom belongs to teacher + student active in class
    await this.validateStudentInClassroom(dto.studentId, dto.classroomId, teacherId);

    const record = await this.prisma.studentBehaviorRecord.create({
      data: {
        classroomId: dto.classroomId,
        studentId: dto.studentId,
        teacherId,
        recordDate: new Date(dto.recordDate),
        category: dto.category,
        behaviorType: dto.behaviorType?.trim() || null,
        level: dto.level,
        content: dto.content,
        resolution: dto.resolution?.trim() || null,
        note: dto.note?.trim() || null,
      },
      include: {
        student: { select: { id: true, fullName: true, initials: true, avatarColor: true } },
        classroom: { select: { id: true, name: true } },
      },
    });

    const response = {
      id: record.id,
      classroomId: record.classroomId,
      className: record.classroom.name,
      studentId: record.studentId,
      studentName: record.student.fullName,
      studentInitials: record.student.initials,
      studentColor: record.student.avatarColor,
      recordDate: record.recordDate.toISOString().split('T')[0],
      category: record.category,
      behaviorType: record.behaviorType,
      level: record.level,
      content: record.content,
      resolution: record.resolution,
      note: record.note,
      createdAt: record.createdAt,
    };

    await this.auditService?.log({
      actorUserId: teacherId,
      action: 'HOMEROOM_BEHAVIOR_CREATE',
      resourceType: 'StudentBehaviorRecord',
      resourceId: record.id,
      details: { classroomId: dto.classroomId, studentId: dto.studentId, category: dto.category, level: dto.level },
    });

    return response;
  }

  async updateBehaviorRecord(id: string, dto: UpdateBehaviorRecordDto, teacherId: string) {
    const existing = await this.prisma.studentBehaviorRecord.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy bản ghi nề nếp');
    }

    if (existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa bản ghi này');
    }
    await this.validateClassroomOwnership(existing.classroomId, teacherId);

    const updated = await this.prisma.studentBehaviorRecord.update({
      where: { id },
      data: {
        recordDate: dto.recordDate ? new Date(dto.recordDate) : undefined,
        category: dto.category || undefined,
        behaviorType: dto.behaviorType === undefined ? undefined : dto.behaviorType.trim() || null,
        level: dto.level || undefined,
        content: dto.content || undefined,
        resolution: dto.resolution === undefined ? undefined : dto.resolution.trim() || null,
        note: dto.note === undefined ? undefined : dto.note.trim() || null,
      },
      include: {
        student: { select: { id: true, fullName: true, initials: true, avatarColor: true } },
        classroom: { select: { id: true, name: true } },
      },
    });

    const response = {
      id: updated.id,
      classroomId: updated.classroomId,
      className: updated.classroom.name,
      studentId: updated.studentId,
      studentName: updated.student.fullName,
      studentInitials: updated.student.initials,
      studentColor: updated.student.avatarColor,
      recordDate: updated.recordDate.toISOString().split('T')[0],
      category: updated.category,
      behaviorType: updated.behaviorType,
      level: updated.level,
      content: updated.content,
      resolution: updated.resolution,
      note: updated.note,
      createdAt: updated.createdAt,
    };

    await this.auditService?.log({
      actorUserId: teacherId,
      action: 'HOMEROOM_BEHAVIOR_UPDATE',
      resourceType: 'StudentBehaviorRecord',
      resourceId: updated.id,
      details: { changedFields: Object.keys(dto) },
    });

    return response;
  }

  async deleteBehaviorRecord(id: string, teacherId: string) {
    const existing = await this.prisma.studentBehaviorRecord.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy bản ghi nề nếp');
    }

    if (existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền xóa bản ghi này');
    }
    await this.validateClassroomOwnership(existing.classroomId, teacherId);

    await this.prisma.studentBehaviorRecord.delete({ where: { id } });
    await this.auditService?.log({
      actorUserId: teacherId,
      action: 'HOMEROOM_BEHAVIOR_DELETE',
      resourceType: 'StudentBehaviorRecord',
      resourceId: id,
      details: { classroomId: existing.classroomId, studentId: existing.studentId },
    });
    return { success: true, message: 'Đã xóa ghi nhận nề nếp' };
  }

  /**
   * Weekly Summary Aggregation
   */
  async getWeeklySummary(classroomId: string, weekNumber: number, schoolYearId: string | undefined, teacherId: string) {
    if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 54) {
      throw new BadRequestException('Số tuần không hợp lệ');
    }
    const classroom = await this.validateClassroomOwnership(classroomId, teacherId);
    if (schoolYearId && schoolYearId !== classroom.schoolYearId) {
      throw new BadRequestException('Năm học không thuộc lớp chủ nhiệm đã chọn');
    }
    const syId = schoolYearId || classroom.schoolYearId;

    // Approximate date range for week
    const schoolYear = await this.prisma.schoolYear.findUnique({ where: { id: syId } });
    if (!schoolYear) throw new NotFoundException('Không tìm thấy năm học');
    const startDate = new Date(schoolYear.startDate);
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + (weekNumber - 1) * 7);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Active students
    const totalStudents = await this.prisma.studentEnrollment.count({
      where: { classroomId, status: 'ACTIVE', student: { deletedAt: null } },
    });
    // Attendance sessions in week
    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        classroomId,
        attendanceDate: { gte: weekStart, lte: weekEnd },
      },
      include: { attendances: true },
    });

    let totalAttendanceRecords = 0;
    let presentCount = 0;
    let excusedAbsence = 0;
    let unexcusedAbsence = 0;
    let late = 0;

    for (const s of sessions) {
      for (const a of s.attendances) {
        totalAttendanceRecords++;
        if (a.status === 'PRESENT') presentCount++;
        else if (a.status === 'EXCUSED_ABSENCE') excusedAbsence++;
        else if (a.status === 'UNEXCUSED_ABSENCE') unexcusedAbsence++;
        else if (a.status === 'LATE') late++;
      }
    }

    const presentRate =
      totalAttendanceRecords > 0
        ? parseFloat(((presentCount / totalAttendanceRecords) * 100).toFixed(1))
        : null;

    // Behavior records in week
    const behaviors = await this.prisma.studentBehaviorRecord.findMany({
      where: {
        classroomId,
        recordDate: { gte: weekStart, lte: weekEnd },
      },
    });

    const behaviorSummary = {
      positive: behaviors.filter((b) => b.level === 'POSITIVE').length,
      reminder: behaviors.filter((b) => b.level === 'REMINDER').length,
      needsAttention: behaviors.filter((b) => b.level === 'NEEDS_ATTENTION').length,
    };

    // Assessment summary in week
    const assessments = await this.prisma.assessment.findMany({
      where: {
        classroomId,
        createdAt: { gte: weekStart, lte: weekEnd },
      },
      include: { studentAssessments: true },
    });

    let excellent = 0;
    let completed = 0;
    let needsSupport = 0;

    for (const ass of assessments) {
      for (const sa of ass.studentAssessments) {
        if (sa.level === 'EXCELLENT') excellent++;
        else if (sa.level === 'COMPLETED') completed++;
        else if (sa.level === 'NEEDS_SUPPORT') needsSupport++;
      }
    }

    return {
      weekNumber,
      dateRange: `${weekStart.toLocaleDateString('vi-VN')} - ${weekEnd.toLocaleDateString('vi-VN')}`,
      attendance: {
        totalStudents,
        totalSessions: sessions.length,
        presentRate,
        excusedAbsence,
        unexcusedAbsence,
        late,
      },
      behavior: behaviorSummary,
      assessment: {
        isRecorded: assessments.length > 0,
        excellent,
        completed,
        needsSupport,
      },
    };
  }

  /**
   * Weekly Review Get & Save
   */
  async getWeeklyReview(classroomId: string, weekNumber: number, schoolYearId: string | undefined, teacherId: string) {
    const classroom = await this.validateClassroomOwnership(classroomId, teacherId);
    if (schoolYearId && schoolYearId !== classroom.schoolYearId) {
      throw new BadRequestException('Năm học không thuộc lớp chủ nhiệm đã chọn');
    }
    const syId = schoolYearId || classroom.schoolYearId;

    const review = await this.prisma.weeklyClassReview.findUnique({
      where: {
        classroomId_schoolYearId_weekNumber: {
          classroomId,
          schoolYearId: syId,
          weekNumber,
        },
      },
    });

    return review || null;
  }

  async saveWeeklyReview(dto: SaveWeeklyReviewDto, teacherId: string) {
    const classroom = await this.validateClassroomOwnership(dto.classroomId, teacherId);
    if (dto.schoolYearId && dto.schoolYearId !== classroom.schoolYearId) {
      throw new BadRequestException('Năm học không thuộc lớp chủ nhiệm đã chọn');
    }
    const schoolYearId = dto.schoolYearId || classroom.schoolYearId;
    for (const studentId of new Set((dto.studentComments || []).map((item) => item.studentId))) {
      await this.validateStudentInClassroom(studentId, dto.classroomId, teacherId);
    }

    const existing = await this.prisma.weeklyClassReview.findUnique({
      where: {
        classroomId_schoolYearId_weekNumber: {
          classroomId: dto.classroomId,
          schoolYearId,
          weekNumber: dto.weekNumber,
        },
      },
    });

    if (existing && dto.version !== undefined && dto.version !== existing.version) {
      throw new ConflictException(
        'Dữ liệu nhận xét tuần đã được cập nhật bởi một phiên làm việc khác. Vui lòng tải lại trang.',
      );
    }

    const nextVersion = (existing?.version || 0) + 1;

    const review = await this.prisma.weeklyClassReview.upsert({
      where: {
        classroomId_schoolYearId_weekNumber: {
          classroomId: dto.classroomId,
          schoolYearId,
          weekNumber: dto.weekNumber,
        },
      },
      update: {
        strengths: dto.strengths,
        limitations: dto.limitations,
        nextWeekPlan: dto.nextWeekPlan,
        notableStudents: dto.notableStudents,
        supportStudents: dto.supportStudents,
        studentComments: dto.studentComments as unknown as Prisma.InputJsonValue | undefined,
        version: nextVersion,
      },
      create: {
        classroomId: dto.classroomId,
        teacherId,
        schoolYearId,
        weekNumber: dto.weekNumber,
        strengths: dto.strengths,
        limitations: dto.limitations,
        nextWeekPlan: dto.nextWeekPlan,
        notableStudents: dto.notableStudents,
        supportStudents: dto.supportStudents,
        studentComments: dto.studentComments as unknown as Prisma.InputJsonValue | undefined,
        version: 1,
      },
    });

    await this.auditService?.log({
      actorUserId: teacherId,
      action: existing ? 'WEEKLY_COMMENT_UPDATE' : 'WEEKLY_COMMENT_CREATE',
      resourceType: 'WeeklyClassReview',
      resourceId: review.id,
      details: { classroomId: dto.classroomId, schoolYearId, weekNumber: dto.weekNumber, version: review.version },
    });
    return review;
  }

  /**
   * Monthly Summary Aggregation
   */
  async getMonthlySummary(classroomId: string, year: number, month: number, teacherId: string) {
    if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('Tháng hoặc năm báo cáo không hợp lệ');
    }
    const classroom = await this.validateClassroomOwnership(classroomId, teacherId);

    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const totalStudents = await this.prisma.studentEnrollment.count({
      where: { classroomId, status: 'ACTIVE', student: { deletedAt: null } },
    });
    const [studentsAtStart, studentsAtEnd, studentsTransferredIn, studentsTransferredOut] =
      await Promise.all([
        this.prisma.studentEnrollment.count({
          where: {
            classroomId,
            enrolledAt: { lt: monthStart },
            OR: [{ leftAt: null }, { leftAt: { gte: monthStart } }],
            student: { deletedAt: null },
          },
        }),
        this.prisma.studentEnrollment.count({
          where: {
            classroomId,
            enrolledAt: { lte: monthEnd },
            OR: [{ leftAt: null }, { leftAt: { gt: monthEnd } }],
            student: { deletedAt: null },
          },
        }),
        this.prisma.studentEnrollment.count({
          where: { classroomId, enrolledAt: { gte: monthStart, lte: monthEnd }, student: { deletedAt: null } },
        }),
        this.prisma.studentEnrollment.count({
          where: { classroomId, leftAt: { gte: monthStart, lte: monthEnd }, student: { deletedAt: null } },
        }),
      ]);

    // Attendance
    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        classroomId,
        attendanceDate: { gte: monthStart, lte: monthEnd },
      },
      include: { attendances: true },
    });

    let totalAttendanceRecords = 0;
    let presentCount = 0;
    let excusedAbsence = 0;
    let unexcusedAbsence = 0;
    let late = 0;

    for (const s of sessions) {
      for (const a of s.attendances) {
        totalAttendanceRecords++;
        if (a.status === 'PRESENT') presentCount++;
        else if (a.status === 'EXCUSED_ABSENCE') excusedAbsence++;
        else if (a.status === 'UNEXCUSED_ABSENCE') unexcusedAbsence++;
        else if (a.status === 'LATE') late++;
      }
    }

    const attendanceRate =
      totalAttendanceRecords > 0
        ? parseFloat(((presentCount / totalAttendanceRecords) * 100).toFixed(1))
        : null;

    // Behavior
    const behaviors = await this.prisma.studentBehaviorRecord.findMany({
      where: {
        classroomId,
        recordDate: { gte: monthStart, lte: monthEnd },
      },
    });

    const behaviorSummary = {
      positive: behaviors.filter((b) => b.level === 'POSITIVE').length,
      reminder: behaviors.filter((b) => b.level === 'REMINDER').length,
      needsAttention: behaviors.filter((b) => b.level === 'NEEDS_ATTENTION').length,
    };

    // Assessment summary in month
    const assessments = await this.prisma.assessment.findMany({
      where: {
        classroomId,
        createdAt: { gte: monthStart, lte: monthEnd },
      },
      include: { studentAssessments: true },
    });

    let excellent = 0;
    let completed = 0;
    let needsSupport = 0;

    for (const ass of assessments) {
      for (const sa of ass.studentAssessments) {
        if (sa.level === 'EXCELLENT') excellent++;
        else if (sa.level === 'COMPLETED') completed++;
        else if (sa.level === 'NEEDS_SUPPORT') needsSupport++;
      }
    }

    // Students needing support and improved
    const studentsNeedingSupport = await this.getStudentsNeedAttention(classroomId, teacherId);
    const improvedStudentIds = Array.from(
      new Set(behaviors.filter((b) => b.level === 'POSITIVE').map((b) => b.studentId)),
    );
    const improvedStudents = improvedStudentIds.length
      ? await this.prisma.student.findMany({
          where: { id: { in: improvedStudentIds }, deletedAt: null },
          select: { id: true, fullName: true },
        })
      : [];

    return {
      year,
      month,
      classroom: {
        id: classroom.id,
        name: classroom.name,
        gradeName: classroom.grade?.name ?? null,
        schoolYearName: classroom.schoolYear?.name ?? null,
      },
      attendance: {
        totalStudents,
        studentsAtStart,
        studentsAtEnd,
        studentsTransferredIn,
        studentsTransferredOut,
        totalSchoolDays: sessions.length,
        attendanceRate,
        excusedAbsence,
        unexcusedAbsence,
        late,
      },
      learning: {
        isRecorded: assessments.length > 0,
        excellent,
        completed,
        needsSupport,
      },
      behavior: behaviorSummary,
      studentsNeedingSupport: studentsNeedingSupport.map((s) => ({
        id: s.studentId,
        name: s.studentName,
        reasons: s.reasons.map((r) => r.description),
      })),
      studentsImproved: improvedStudents.map((student) => ({
        id: student.id,
        name: student.fullName,
        note: 'Có ghi nhận nề nếp tích cực trong tháng',
      })),
    };
  }

  /**
   * Monthly Review Get & Save
   */
  async getMonthlyReview(classroomId: string, year: number, month: number, teacherId: string) {
    await this.validateClassroomOwnership(classroomId, teacherId);

    const review = await this.prisma.monthlyClassReview.findUnique({
      where: {
        classroomId_year_month: {
          classroomId,
          year,
          month,
        },
      },
    });

    return review || null;
  }

  async saveMonthlyReview(dto: SaveMonthlyReviewDto, teacherId: string) {
    const classroom = await this.validateClassroomOwnership(dto.classroomId, teacherId);
    if (dto.schoolYearId && dto.schoolYearId !== classroom.schoolYearId) {
      throw new BadRequestException('Năm học không thuộc lớp chủ nhiệm đã chọn');
    }
    const schoolYearId = dto.schoolYearId || classroom.schoolYearId;

    const existing = await this.prisma.monthlyClassReview.findUnique({
      where: {
        classroomId_year_month: {
          classroomId: dto.classroomId,
          year: dto.year,
          month: dto.month,
        },
      },
    });

    if (existing && dto.version !== undefined && dto.version !== existing.version) {
      throw new ConflictException(
        'Dữ liệu tổng kết tháng đã được cập nhật bởi một phiên làm việc khác. Vui lòng tải lại trang.',
      );
    }

    const nextVersion = (existing?.version || 0) + 1;
    const summarySnapshot = await this.getMonthlySummary(dto.classroomId, dto.year, dto.month, teacherId);

    const review = await this.prisma.monthlyClassReview.upsert({
      where: {
        classroomId_year_month: {
          classroomId: dto.classroomId,
          year: dto.year,
          month: dto.month,
        },
      },
      update: {
        highlights: dto.highlights,
        limitations: dto.limitations,
        nextMonthPlan: dto.nextMonthPlan,
        generalComment: dto.generalComment,
        difficulties: dto.difficulties,
        measures: dto.measures,
        classActivities: dto.classActivities,
        summarySnapshot,
        version: nextVersion,
      },
      create: {
        classroomId: dto.classroomId,
        teacherId,
        schoolYearId,
        year: dto.year,
        month: dto.month,
        highlights: dto.highlights,
        limitations: dto.limitations,
        nextMonthPlan: dto.nextMonthPlan,
        generalComment: dto.generalComment,
        difficulties: dto.difficulties,
        measures: dto.measures,
        classActivities: dto.classActivities,
        summarySnapshot,
        version: 1,
      },
    });

    await this.auditService?.log({
      actorUserId: teacherId,
      action: existing ? 'MONTHLY_REPORT_UPDATE' : 'MONTHLY_REPORT_CREATE',
      resourceType: 'MonthlyClassReview',
      resourceId: review.id,
      details: { classroomId: dto.classroomId, year: dto.year, month: dto.month, version: review.version },
    });
    return review;
  }

  async getHomeroomTasks(classroomId: string, teacherId: string) {
    await this.validateClassroomOwnership(classroomId, teacherId);
    const tasks = await this.prisma.teacherTask.findMany({
      where: { classroomId, teacherId },
      orderBy: [{ done: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }],
    });
    const today = new Date().toISOString().slice(0, 10);
    return tasks.map((task) => ({
      ...task,
      effectiveStatus:
        !task.done && task.dueDate && task.dueDate < today ? 'OVERDUE' : task.status,
    }));
  }

  async createHomeroomTask(classroomId: string, dto: CreateHomeroomTaskDto, teacherId: string) {
    await this.validateClassroomOwnership(classroomId, teacherId);
    const task = await this.prisma.teacherTask.create({
      data: {
        classroomId,
        teacherId,
        title: dto.title.trim(),
        description: dto.note?.trim() || null,
        dueDate: dto.dueDate?.slice(0, 10) || null,
        priority: dto.priority || 'MEDIUM',
        status: 'PENDING',
        done: false,
      },
    });
    await this.auditService?.log({
      actorUserId: teacherId,
      action: 'HOMEROOM_TASK_CREATE',
      resourceType: 'TeacherTask',
      resourceId: task.id,
      details: { classroomId, priority: task.priority, dueDate: task.dueDate },
    });
    return task;
  }

  async updateHomeroomTask(classroomId: string, id: string, dto: UpdateHomeroomTaskDto, teacherId: string) {
    await this.validateClassroomOwnership(classroomId, teacherId);
    const existing = await this.prisma.teacherTask.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Không tìm thấy việc chủ nhiệm');
    if (existing.teacherId !== teacherId || existing.classroomId !== classroomId) {
      throw new ForbiddenException('Bạn không có quyền cập nhật việc chủ nhiệm này');
    }
    const done = dto.status === undefined ? undefined : dto.status === 'COMPLETED';
    const task = await this.prisma.teacherTask.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description: dto.note === undefined ? undefined : dto.note.trim() || null,
        dueDate: dto.dueDate?.slice(0, 10),
        priority: dto.priority,
        status: dto.status,
        done,
        completedAt: done === undefined ? undefined : done ? new Date() : null,
      },
    });
    await this.auditService?.log({
      actorUserId: teacherId,
      action: 'HOMEROOM_TASK_UPDATE',
      resourceType: 'TeacherTask',
      resourceId: task.id,
      details: { classroomId, changedFields: Object.keys(dto) },
    });
    return task;
  }

  async getGuardianDirectory(classroomId: string, teacherId: string) {
    await this.validateClassroomOwnership(classroomId, teacherId);
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { classroomId, status: 'ACTIVE', student: { deletedAt: null } },
      select: {
        student: {
          select: { id: true, fullName: true, parentName: true, parentPhone: true, parentEmail: true },
        },
      },
      orderBy: { student: { fullName: 'asc' } },
    });
    return enrollments.map(({ student }) => student);
  }

  async getParentContacts(classroomId: string, teacherId: string, studentId?: string) {
    await this.validateClassroomOwnership(classroomId, teacherId);
    if (studentId) await this.validateStudentInClassroom(studentId, classroomId, teacherId);
    return this.prisma.parentContactLog.findMany({
      where: { classroomId, teacherId, studentId },
      include: { student: { select: { id: true, fullName: true } } },
      orderBy: [{ contactDate: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async createParentContact(classroomId: string, dto: CreateParentContactDto, teacherId: string) {
    const student = await this.validateStudentInClassroom(dto.studentId, classroomId, teacherId);
    const log = await this.prisma.parentContactLog.create({
      data: {
        classroomId,
        studentId: dto.studentId,
        teacherId,
        contactDate: this.dateOnly(dto.contactDate),
        guardianName: dto.guardianName?.trim() || student.parentName || null,
        relationship: dto.relationship?.trim() || null,
        method: dto.method,
        content: dto.content.trim(),
        outcome: dto.outcome?.trim() || null,
        followUp: dto.followUp?.trim() || null,
      },
      include: { student: { select: { id: true, fullName: true } } },
    });
    await this.auditService?.log({
      actorUserId: teacherId,
      action: 'PARENT_CONTACT_CREATE',
      resourceType: 'ParentContactLog',
      resourceId: log.id,
      details: { classroomId, studentId: dto.studentId, method: dto.method, contactDate: dto.contactDate },
    });
    return log;
  }

  async updateParentContact(
    classroomId: string,
    id: string,
    dto: UpdateParentContactDto,
    teacherId: string,
  ) {
    await this.validateClassroomOwnership(classroomId, teacherId);
    const existing = await this.prisma.parentContactLog.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Không tìm thấy lần trao đổi phụ huynh');
    if (existing.classroomId !== classroomId || existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền cập nhật lần trao đổi phụ huynh này');
    }
    if (dto.studentId) {
      await this.validateStudentInClassroom(dto.studentId, classroomId, teacherId);
    }
    const updated = await this.prisma.parentContactLog.update({
      where: { id },
      data: {
        studentId: dto.studentId,
        contactDate: dto.contactDate ? this.dateOnly(dto.contactDate) : undefined,
        guardianName: dto.guardianName === undefined ? undefined : dto.guardianName.trim() || null,
        relationship: dto.relationship === undefined ? undefined : dto.relationship.trim() || null,
        method: dto.method,
        content: dto.content?.trim(),
        outcome: dto.outcome === undefined ? undefined : dto.outcome.trim() || null,
        followUp: dto.followUp === undefined ? undefined : dto.followUp.trim() || null,
      },
      include: { student: { select: { id: true, fullName: true } } },
    });
    await this.auditService?.log({
      actorUserId: teacherId,
      action: 'PARENT_CONTACT_UPDATE',
      resourceType: 'ParentContactLog',
      resourceId: id,
      details: { classroomId, changedFields: Object.keys(dto) },
    });
    return updated;
  }

  async deleteParentContact(classroomId: string, id: string, teacherId: string) {
    await this.validateClassroomOwnership(classroomId, teacherId);
    const existing = await this.prisma.parentContactLog.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Không tìm thấy lần trao đổi phụ huynh');
    if (existing.classroomId !== classroomId || existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền xóa lần trao đổi phụ huynh này');
    }
    await this.prisma.parentContactLog.delete({ where: { id } });
    await this.auditService?.log({
      actorUserId: teacherId,
      action: 'PARENT_CONTACT_DELETE',
      resourceType: 'ParentContactLog',
      resourceId: id,
      details: { classroomId },
    });
    return { success: true, message: 'Đã xóa lịch sử trao đổi phụ huynh' };
  }

  /**
   * Export Weekly Review
   */
  async exportWeeklyReview(
    classroomId: string,
    weekNumber: number,
    schoolYearId: string | undefined,
    teacherId: string,
    format: 'docx' | 'pdf',
  ) {
    const classroom = await this.validateClassroomOwnership(classroomId, teacherId);
    const summary = await this.getWeeklySummary(classroomId, weekNumber, schoolYearId, teacherId);
    const review = await this.getWeeklyReview(classroomId, weekNumber, schoolYearId, teacherId);
    const studentsNeedAttention = await this.getStudentsNeedAttention(classroomId, teacherId);

    const exportData: WeeklyReviewExportData = {
      className: classroom.name,
      gradeName: classroom.grade.name,
      schoolYearName: classroom.schoolYear.name,
      weekNumber,
      teacherName: classroom.homeroomTeacher.fullName,
      dateRange: summary.dateRange,
      attendance: summary.attendance,
      learning: summary.assessment,
      behavior: summary.behavior,
      studentsNeedAttention: studentsNeedAttention.map((s) => ({
        name: s.studentName,
        reasons: s.reasons.map((r) => r.description),
      })),
      strengths: review?.strengths,
      limitations: review?.limitations,
      nextWeekPlan: review?.nextWeekPlan,
    };

    const rawFilename = `Bao_cao_chu_nhiem_Tuan_${weekNumber}_Lop_${classroom.name}`;
    const { asciiFilename, utf8Filename } = sanitizeFilename(rawFilename, format);

    const buffer =
      format === 'docx'
        ? await this.homeroomExportService.generateWeeklyReviewDocx(exportData)
        : await this.homeroomExportService.generateWeeklyReviewPdf(exportData);

    return { buffer, asciiFilename, utf8Filename };
  }

  /**
   * Export Monthly Summary
   */
  async exportMonthlySummary(
    classroomId: string,
    year: number,
    month: number,
    teacherId: string,
    format: 'docx' | 'pdf',
  ) {
    const classroom = await this.validateClassroomOwnership(classroomId, teacherId);
    const summary = await this.getMonthlySummary(classroomId, year, month, teacherId);
    const review = await this.getMonthlyReview(classroomId, year, month, teacherId);

    const exportData: MonthlySummaryExportData = {
      className: classroom.name,
      gradeName: classroom.grade.name,
      schoolYearName: classroom.schoolYear.name,
      year,
      month,
      teacherName: classroom.homeroomTeacher.fullName,
      attendance: summary.attendance,
      learning: summary.learning,
      behavior: summary.behavior,
      studentsImproved: summary.studentsImproved,
      studentsNeedingSupport: summary.studentsNeedingSupport,
      highlights: review?.highlights,
      limitations: review?.limitations,
      nextMonthPlan: review?.nextMonthPlan,
    };

    const rawFilename = `Bao_cao_chu_nhiem_Thang_${month}_${year}_Lop_${classroom.name}`;
    const { asciiFilename, utf8Filename } = sanitizeFilename(rawFilename, format);

    const buffer =
      format === 'docx'
        ? await this.homeroomExportService.generateMonthlySummaryDocx(exportData)
        : await this.homeroomExportService.generateMonthlySummaryPdf(exportData);

    return { buffer, asciiFilename, utf8Filename };
  }
}
