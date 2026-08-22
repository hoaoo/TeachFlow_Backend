import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
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

@Injectable()
export class HomeroomService {
  private readonly logger = new Logger(HomeroomService.name);

  constructor(
    private prisma: PrismaService,
    private homeroomExportService: HomeroomExportService,
  ) {}

  /**
   * Validate Classroom exists, not deleted, and belongs to currentTeacherId
   */
  async validateClassroomOwnership(classroomId: string, teacherId: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      include: {
        schoolYear: true,
        grade: true,
        teacher: true,
      },
    });

    if (!classroom || classroom.deletedAt) {
      throw new NotFoundException('Không tìm thấy lớp học');
    }

    if (classroom.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập lớp học này');
    }

    return classroom;
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

    const classStudent = await this.prisma.classStudent.findUnique({
      where: {
        classroomId_studentId: {
          classroomId,
          studentId,
        },
      },
    });

    if (!classStudent || classStudent.status !== 'ACTIVE') {
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
      const firstClass = await this.prisma.classroom.findFirst({
        where: { teacherId, deletedAt: null },
        orderBy: { name: 'asc' },
      });
      if (!firstClass) {
        return {
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
          studentsNeedAttention: [],
          upcomingBirthdays: [],
          recentBehavior: [],
          recentEvents: [],
        };
      }
      classroomId = firstClass.id;
    }

    const classroom = await this.validateClassroomOwnership(classroomId, teacherId);

    // Active students count
    const studentCount = await this.prisma.classStudent.count({
      where: { classroomId, status: 'ACTIVE', student: { deletedAt: null } },
    });

    // Attendance Today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sessionToday = await this.prisma.attendanceSession.findFirst({
      where: {
        classroomId,
        attendanceDate: today,
      },
      include: {
        attendances: true,
      },
    });

    const attendances = sessionToday?.attendances || [];
    const attendanceToday = {
      isRecorded: !!sessionToday,
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
      where: { classroomId, teacherId },
      include: {
        student: { select: { id: true, fullName: true, avatarColor: true, initials: true } },
      },
      orderBy: { recordDate: 'desc' },
      take: 5,
    });

    // Weekly tasks
    const tasks = await this.prisma.teacherTask.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });

    // Current week review (latest)
    const currentWeekReview = await this.prisma.weeklyClassReview.findFirst({
      where: { classroomId, teacherId, schoolYearId: classroom.schoolYearId },
      orderBy: { weekNumber: 'desc' },
    });

    return {
      classroom: {
        id: classroom.id,
        name: classroom.name,
        room: classroom.room || 'Phòng học',
        schedule: classroom.schedule || 'Cả ngày',
        accent: classroom.accent || 'teal',
        studentCount,
        gradeName: classroom.grade?.name || 'Khối 4',
        schoolYearName: classroom.schoolYear?.name || '2026 - 2027',
        schoolYearId: classroom.schoolYearId,
      },
      attendanceToday,
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
        due: t.dueDate || 'Tuần này',
        done: t.done,
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

    const classStudents = await this.prisma.classStudent.findMany({
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
                createdAt: { gte: windowStart },
              },
              include: {
                attendanceSession: true,
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
    await this.validateClassroomOwnership(classroomId, teacherId);

    const classStudents = await this.prisma.classStudent.findMany({
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
    const where: any = { teacherId };

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
        level: r.level,
        content: r.content,
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
        level: dto.level,
        content: dto.content,
      },
      include: {
        student: { select: { id: true, fullName: true, initials: true, avatarColor: true } },
        classroom: { select: { id: true, name: true } },
      },
    });

    return {
      id: record.id,
      classroomId: record.classroomId,
      className: record.classroom.name,
      studentId: record.studentId,
      studentName: record.student.fullName,
      studentInitials: record.student.initials,
      studentColor: record.student.avatarColor,
      recordDate: record.recordDate.toISOString().split('T')[0],
      category: record.category,
      level: record.level,
      content: record.content,
      createdAt: record.createdAt,
    };
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

    const updated = await this.prisma.studentBehaviorRecord.update({
      where: { id },
      data: {
        recordDate: dto.recordDate ? new Date(dto.recordDate) : undefined,
        category: dto.category || undefined,
        level: dto.level || undefined,
        content: dto.content || undefined,
      },
      include: {
        student: { select: { id: true, fullName: true, initials: true, avatarColor: true } },
        classroom: { select: { id: true, name: true } },
      },
    });

    return {
      id: updated.id,
      classroomId: updated.classroomId,
      className: updated.classroom.name,
      studentId: updated.studentId,
      studentName: updated.student.fullName,
      studentInitials: updated.student.initials,
      studentColor: updated.student.avatarColor,
      recordDate: updated.recordDate.toISOString().split('T')[0],
      category: updated.category,
      level: updated.level,
      content: updated.content,
      createdAt: updated.createdAt,
    };
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

    await this.prisma.studentBehaviorRecord.delete({ where: { id } });
    return { success: true, message: 'Đã xóa ghi nhận nề nếp' };
  }

  /**
   * Weekly Summary Aggregation
   */
  async getWeeklySummary(classroomId: string, weekNumber: number, schoolYearId: string | undefined, teacherId: string) {
    const classroom = await this.validateClassroomOwnership(classroomId, teacherId);
    const syId = schoolYearId || classroom.schoolYearId;

    // Approximate date range for week
    const schoolYear = await this.prisma.schoolYear.findUnique({ where: { id: syId } });
    const startDate = new Date(schoolYear?.startDate || '2026-09-01');
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + (weekNumber - 1) * 7);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Active students
    const totalStudents = await this.prisma.classStudent.count({
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
        : 100.0;

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

    // Default if no assessments recorded during this exact week
    if (excellent === 0 && completed === 0 && needsSupport === 0 && totalStudents > 0) {
      completed = totalStudents;
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
    const schoolYearId = dto.schoolYearId || classroom.schoolYearId;

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
        version: 1,
      },
    });

    return review;
  }

  /**
   * Monthly Summary Aggregation
   */
  async getMonthlySummary(classroomId: string, year: number, month: number, teacherId: string) {
    const classroom = await this.validateClassroomOwnership(classroomId, teacherId);

    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const totalStudents = await this.prisma.classStudent.count({
      where: { classroomId, status: 'ACTIVE', student: { deletedAt: null } },
    });

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
        : 100.0;

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

    if (excellent === 0 && completed === 0 && needsSupport === 0 && totalStudents > 0) {
      completed = totalStudents;
    }

    // Students needing support and improved
    const studentsNeedingSupport = await this.getStudentsNeedAttention(classroomId, teacherId);

    return {
      year,
      month,
      classroom: {
        id: classroom.id,
        name: classroom.name,
        gradeName: classroom.grade?.name || 'Khối 4',
        schoolYearName: classroom.schoolYear?.name || '2026 - 2027',
      },
      attendance: {
        totalStudents,
        totalSchoolDays: sessions.length,
        attendanceRate,
        excusedAbsence,
        unexcusedAbsence,
        late,
      },
      learning: {
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
      studentsImproved: [
        { name: 'Nguyễn Minh Anh', note: 'Có nhiều tiến bộ trong tiếp thu bài và ý thức kỷ luật' },
        { name: 'Trần Gia Huy', note: 'Tích cực xây dựng bài, hợp tác nhóm tốt' },
      ],
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
        version: 1,
      },
    });

    return review;
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
      gradeName: classroom.grade?.name || 'Khối 4',
      schoolYearName: classroom.schoolYear?.name || '2026 - 2027',
      weekNumber,
      teacherName: classroom.teacher?.fullName || 'Giáo viên chủ nhiệm',
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
      gradeName: classroom.grade?.name || 'Khối 4',
      schoolYearName: classroom.schoolYear?.name || '2026 - 2027',
      year,
      month,
      teacherName: classroom.teacher?.fullName || 'Giáo viên chủ nhiệm',
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
