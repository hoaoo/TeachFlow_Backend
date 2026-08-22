import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { getTodayVNRange } from '../tasks/tasks-cleanup.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboardData(user: AuthenticatedUser) {
    // 1. Resolve teacherId and teacher profile
    let teacherId = user.teacherId;
    let teacherName = user.teacherName;

    if (!teacherId && user.userId) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { userId: user.userId },
        select: { id: true, fullName: true },
      });
      if (teacher) {
        teacherId = teacher.id;
        teacherName = teacher.fullName;
      }
    }

    // 2. Active SchoolYear & Semester
    const currentSchoolYear = await this.prisma.schoolYear.findFirst({
      where: { isCurrent: true },
    });

    const currentSemester = await this.prisma.semester.findFirst({
      where: {
        isActive: true,
        ...(currentSchoolYear ? { schoolYearId: currentSchoolYear.id } : {}),
      },
      orderBy: { sortOrder: 'asc' },
    });

    // 3. Greeting with real date in Vietnamese
    const now = new Date();
    const formattedDate = new Intl.DateTimeFormat('vi-VN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now);
    const capitalizedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

    const hour = now.getHours();
    const timeGreeting = hour < 12 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
    const displayName = teacherName ? teacherName : user.email?.split('@')[0] || 'thầy/cô';

    // 4. Find teacher's active classrooms (homeroom + assigned)
    const teacherClassrooms = teacherId
      ? await this.prisma.classroom.findMany({
          where: {
            isActive: true,
            deletedAt: null,
            ...(currentSchoolYear ? { schoolYearId: currentSchoolYear.id } : {}),
            OR: [
              { teacherId },
              { teachingAssignments: { some: { teacherId, isActive: true } } },
            ],
          },
          include: {
            grade: true,
            schoolYear: true,
          },
          orderBy: { name: 'asc' },
        })
      : [];

    const teacherClassroomIds = teacherClassrooms.map((c) => c.id);

    // Primary classroom for class progress widget (prefer homeroom class, else first assigned)
    const homeroomClass = teacherClassrooms.find((c) => c.teacherId === teacherId) || teacherClassrooms[0] || null;

    // 5. Query active students in teacher's classrooms
    const activeEnrollments = teacherClassroomIds.length > 0
      ? await this.prisma.studentEnrollment.findMany({
          where: {
            classroomId: { in: teacherClassroomIds },
            status: 'ACTIVE',
            ...(currentSchoolYear ? { schoolYearId: currentSchoolYear.id } : {}),
          },
          include: {
            student: {
              select: {
                id: true,
                fullName: true,
                gender: true,
                status: true,
              },
            },
            classroom: {
              select: { id: true, name: true },
            },
          },
        })
      : [];

    const uniqueStudentIds = Array.from(new Set(activeEnrollments.map((e) => e.student.id)));
    const totalStudentsCount = uniqueStudentIds.length;

    // Students needing support
    const needsSupportStudents = activeEnrollments.filter(
      (e) => e.student.status === 'NEEDS_SUPPORT',
    );
    const needsSupportCount = new Set(needsSupportStudents.map((e) => e.student.id)).size;

    // 6. Lesson plans count
    const lessonPlansCount = await this.prisma.lessonPlan.count({
      where: {
        status: { in: ['COMPLETED', 'TAUGHT'] },
        deletedAt: null,
        ...(teacherId ? { teacherId } : {}),
        ...(currentSchoolYear ? { classroom: { schoolYearId: currentSchoolYear.id } } : {}),
      },
    });

    // 7. Teacher tasks (filtered for today in Asia/Ho_Chi_Minh)
    const { todayStr, startOfDayUTC, endOfDayUTC } = getTodayVNRange();

    const dbTasks = teacherId
      ? await this.prisma.teacherTask.findMany({
          where: {
            teacherId,
            OR: [
              { taskDate: todayStr },
              {
                AND: [
                  { taskDate: null },
                  { createdAt: { gte: startOfDayUTC, lte: endOfDayUTC } },
                ],
              },
            ],
          },
          orderBy: [{ done: 'asc' }, { createdAt: 'asc' }],
        })
      : [];

    const tasks = dbTasks.map((t) => ({
      id: t.id,
      title: t.title,
      due: t.dueDate || 'Hôm nay',
      done: t.done,
      priority: t.priority,
      taskDate: t.taskDate,
      completedAt: t.completedAt,
    }));

    const completedTasksCount = tasks.filter((t) => t.done).length;
    const taskPercent = tasks.length > 0 ? Math.round((completedTasksCount / tasks.length) * 100) : 0;

    // 8. Schedules / Today's lessons
    const todaySchedules = await this.prisma.schedule.findMany({
      where: {
        ...(teacherId ? { teacherId } : {}),
        deletedAt: null,
        plannedDate: { gte: startOfDayUTC, lte: endOfDayUTC },
      },
      include: {
        classroom: { include: { grade: true } },
        subject: true,
      },
      orderBy: { startTime: 'asc' },
    });

    const schedulesList =
      todaySchedules.length > 0
        ? todaySchedules
        : await this.prisma.schedule.findMany({
            where: {
              ...(teacherId ? { teacherId } : {}),
              deletedAt: null,
            },
            include: {
              classroom: { include: { grade: true } },
              subject: true,
            },
            orderBy: [{ plannedDate: 'asc' }, { startTime: 'asc' }],
            take: 6,
          });

    const lessons = schedulesList.map((s, i) => ({
      id: s.id,
      time: s.startTime && s.endTime ? `${s.startTime} - ${s.endTime}` : s.startTime || '07:30',
      startTime: s.startTime || '07:00',
      endTime: s.endTime || '07:45',
      plannedDate: s.plannedDate ? s.plannedDate.toISOString().split('T')[0] : todayStr,
      status: s.status || 'PLANNED',
      isManualStatus: Boolean(s.isManualStatus),
      subject: s.subject?.name || 'Môn học',
      title: s.title || `Tiết học ${i + 1}`,
      className: s.classroom?.name || 'Lớp',
      gradeName: s.classroom?.grade?.name || null,
      room: s.room || s.classroom?.room || 'Phòng học',
      color: i % 3 === 0 ? 'teal' : i % 3 === 1 ? 'orange' : 'blue',
    }));

    // 9. Class progress for primary/homeroom class
    let classProgress = {
      className: homeroomClass ? `Lớp ${homeroomClass.name}` : 'Chưa phân lớp',
      overallPercent: 0,
      excellent: 0,
      improving: 0,
      needsSupport: 0,
      totalStudents: 0,
    };

    if (homeroomClass) {
      const homeroomEnrollments = activeEnrollments.filter((e) => e.classroomId === homeroomClass.id);
      const total = homeroomEnrollments.length;
      const excellent = homeroomEnrollments.filter((e) => e.student.status === 'EXCELLENT').length;
      const improving = homeroomEnrollments.filter((e) => e.student.status === 'GOOD').length;
      const needsSupport = homeroomEnrollments.filter((e) => e.student.status === 'NEEDS_SUPPORT').length;
      const overallPercent = total > 0 ? Math.round(((excellent + improving) / total) * 100) : 0;

      classProgress = {
        className: `Lớp ${homeroomClass.name}`,
        overallPercent,
        excellent,
        improving,
        needsSupport,
        totalStudents: total,
      };
    }

    // 10. Featured students from active enrollments
    const featuredStudents = activeEnrollments
      .slice(0, 5)
      .map((e) => {
        const s = e.student;
        const parts = s.fullName.trim().split(/\s+/);
        const initials =
          parts.length >= 2
            ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
            : s.fullName.slice(0, 2).toUpperCase();

        const progress = s.status === 'EXCELLENT' ? 95 : s.status === 'GOOD' ? 82 : 65;
        const statusLabel = s.status === 'EXCELLENT' ? 'Tốt' : s.status === 'GOOD' ? 'Khá' : 'Cần cố gắng';
        const color =
          s.status === 'EXCELLENT'
            ? 'bg-teal-100 text-teal-700'
            : s.status === 'GOOD'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-orange-100 text-orange-700';

        return {
          id: s.id,
          name: s.fullName,
          className: e.classroom?.name,
          initials,
          progress,
          status: statusLabel,
          color,
        };
      });

    // 11. Recent Attendance rate
    const recentAttendanceSessions = teacherClassroomIds.length > 0
      ? await this.prisma.attendanceSession.findMany({
          where: {
            classroomId: { in: teacherClassroomIds },
          },
          include: {
            attendances: true,
          },
          orderBy: { attendanceDate: 'desc' },
          take: 5,
        })
      : [];

    let totalAttendanceRecords = 0;
    let presentAttendanceRecords = 0;
    for (const session of recentAttendanceSessions) {
      for (const record of session.attendances) {
        totalAttendanceRecords++;
        if (record.status === 'PRESENT') {
          presentAttendanceRecords++;
        }
      }
    }
    const attendanceRate =
      totalAttendanceRecords > 0
        ? Math.round((presentAttendanceRecords / totalAttendanceRecords) * 100)
        : 100;

    // 12. Stats items
    const stats = [
      {
        label: 'Lớp phụ trách',
        value: String(teacherClassrooms.length),
        note: currentSchoolYear ? `Năm học ${currentSchoolYear.name}` : 'Năm học hiện tại',
        tone: 'teal',
        icon: 'CalendarDays',
      },
      {
        label: 'Giáo án hoàn thành',
        value: String(lessonPlansCount),
        note: 'Đã hoàn thành / đã dạy',
        tone: 'blue',
        icon: 'BookOpen',
      },
      {
        label: 'Học sinh cần chú ý',
        value: String(needsSupportCount),
        note: totalStudentsCount > 0 ? `Trên tổng số ${totalStudentsCount} học sinh` : 'Chưa có học sinh',
        tone: 'orange',
        icon: 'GraduationCap',
      },
      {
        label: 'Nhiệm vụ tuần này',
        value: `${completedTasksCount}/${tasks.length}`,
        note: `${taskPercent}% hoàn thành`,
        tone: 'purple',
        icon: 'CheckCircle2',
      },
    ];

    return {
      greeting: {
        date: capitalizedDate,
        title: `${timeGreeting}, ${displayName}`,
        description: currentSchoolYear
          ? `Năm học ${currentSchoolYear.name}${currentSemester ? ` — ${currentSemester.name}` : ''}. Chúc thầy/cô một ngày làm việc hiệu quả!`
          : 'Chào mừng thầy/cô quay trở lại hệ thống trợ lý giáo viên TeachFlow.',
      },
      currentSchoolYear: currentSchoolYear
        ? { id: currentSchoolYear.id, name: currentSchoolYear.name }
        : null,
      currentSemester: currentSemester
        ? { id: currentSemester.id, name: currentSemester.name }
        : null,
      stats,
      lessons,
      tasks,
      classProgress,
      featuredStudents,
      attendanceRate,
    };
  }

  async getDashboardSchedule(
    user: AuthenticatedUser,
    query: { date?: string; from?: string; to?: string },
  ) {
    let teacherId = user.teacherId;
    if (!teacherId && user.userId) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { userId: user.userId },
        select: { id: true },
      });
      if (teacher) teacherId = teacher.id;
    }

    if (!teacherId) return [];

    let start: Date;
    let end: Date;

    if (query.date) {
      start = new Date(`${query.date}T00:00:00.000+07:00`);
      end = new Date(`${query.date}T23:59:59.999+07:00`);
    } else if (query.from && query.to) {
      start = new Date(`${query.from}T00:00:00.000+07:00`);
      end = new Date(`${query.to}T23:59:59.999+07:00`);
    } else {
      const { startOfDayUTC, endOfDayUTC } = getTodayVNRange();
      start = startOfDayUTC;
      end = endOfDayUTC;
    }

    const schedules = await this.prisma.schedule.findMany({
      where: {
        teacherId,
        deletedAt: null,
        plannedDate: { gte: start, lte: end },
      },
      include: {
        classroom: { include: { grade: true } },
        subject: true,
        attendanceSession: {
          include: {
            attendances: true,
          },
        },
        lessonPlan: {
          select: { id: true, title: true },
        },
      },
      orderBy: [
        { plannedDate: 'asc' },
        { startTime: 'asc' },
      ],
    });

    return schedules.map((s, i) => {
      const hasAttendance = !!s.attendanceSession;
      const totalStudents = s.attendanceSession?.attendances.length || 0;
      const presentStudents = s.attendanceSession?.attendances.filter((a) => a.status === 'PRESENT').length || 0;
      const attendanceLabel = hasAttendance
        ? `${presentStudents}/${totalStudents}`
        : 'Chưa điểm danh';

      return {
        id: s.id,
        time: s.startTime && s.endTime ? `${s.startTime} - ${s.endTime}` : s.startTime || '07:30',
        startTime: s.startTime || '07:00',
        endTime: s.endTime || '07:45',
        plannedDate: s.plannedDate ? s.plannedDate.toISOString().split('T')[0] : null,
        status: s.status || 'PLANNED',
        isManualStatus: Boolean(s.isManualStatus),
        subject: s.subject?.name || 'Môn học',
        title: s.title || `Tiết học ${i + 1}`,
        className: s.classroom?.name || 'Lớp',
        classroomId: s.classroomId,
        gradeName: s.classroom?.grade?.name || null,
        room: s.room || s.classroom?.room || 'Phòng học',
        hasLessonPlan: !!s.lessonPlanId,
        lessonPlanId: s.lessonPlanId || null,
        lessonPlanTitle: s.lessonPlan?.title || null,
        attendanceRecorded: hasAttendance,
        attendanceLabel,
        attendancePresentCount: presentStudents,
        attendanceTotalCount: totalStudents,
        color: i % 3 === 0 ? 'teal' : i % 3 === 1 ? 'orange' : 'blue',
      };
    });
  }
}
