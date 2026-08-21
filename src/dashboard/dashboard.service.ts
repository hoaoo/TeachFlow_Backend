import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

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

    // 7. Teacher tasks
    const dbTasks = teacherId
      ? await this.prisma.teacherTask.findMany({
          where: { teacherId },
          orderBy: [{ done: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
          take: 10,
        })
      : [];

    const tasks = dbTasks.map((t) => ({
      id: t.id,
      title: t.title,
      due: t.dueDate || 'Chưa đặt hạn',
      done: t.done,
      priority: t.priority,
    }));

    const completedTasksCount = tasks.filter((t) => t.done).length;
    const taskPercent = tasks.length > 0 ? Math.round((completedTasksCount / tasks.length) * 100) : 0;

    // 8. Teaching plans / Today's lessons
    const teachingPlans = await this.prisma.teachingPlan.findMany({
      where: {
        ...(teacherId ? { teacherId } : {}),
        classroom: {
          isActive: true,
          deletedAt: null,
          ...(currentSchoolYear ? { schoolYearId: currentSchoolYear.id } : {}),
        },
      },
      include: {
        classroom: true,
        subject: true,
        lesson: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const lessons = teachingPlans.map((tp, i) => {
      const timeSlots = ['07:30', '08:20', '09:15', '10:05', '14:00', '14:50'];
      return {
        time: timeSlots[i] || `${7 + i}:30`,
        subject: tp.subject?.name || 'Chung',
        title: tp.title || tp.lesson?.title || `Kế hoạch ${i + 1}`,
        className: tp.classroom?.name || 'Lớp',
        room: tp.room || tp.classroom?.room || 'Phòng học',
        color: i % 3 === 0 ? 'teal' : i % 3 === 1 ? 'orange' : 'blue',
      };
    });

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
}
