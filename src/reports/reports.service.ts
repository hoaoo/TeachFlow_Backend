import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ReportFilterDto } from './dto/report-filter.dto';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } from 'docx';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private prisma: PrismaService) {}

  private async getTeacherId(user: AuthenticatedUser): Promise<string | null> {
    if (user.teacherId) return user.teacherId;
    if (!user.userId) return null;
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: user.userId },
      select: { id: true },
    });
    return teacher?.id || null;
  }

  private async validateClassroomAccess(classroomId: string, user: AuthenticatedUser): Promise<void> {
    if (user.role === 'ADMIN') return;

    const teacherId = await this.getTeacherId(user);
    if (!teacherId) {
      throw new ForbiddenException('Tài khoản không có hồ sơ giáo viên để truy cập lớp này');
    }

    const classroom = await this.prisma.classroom.findFirst({
      where: {
        id: classroomId,
        isActive: true,
        deletedAt: null,
        OR: [
          { teacherId },
          { teachingAssignments: { some: { teacherId, isActive: true } } },
        ],
      },
    });

    if (!classroom) {
      throw new ForbiddenException('Bạn không có quyền truy cập dữ liệu báo cáo của lớp học này');
    }
  }

  /**
   * 1. ATTENDANCE REPORT
   */
  async getAttendanceReport(filter: ReportFilterDto, user: AuthenticatedUser) {
    const teacherId = await this.getTeacherId(user);

    if (filter.classroomId) {
      await this.validateClassroomAccess(filter.classroomId, user);
    }

    // Build session query filter
    const sessionWhere: any = {};

    if (filter.classroomId) {
      sessionWhere.classroomId = filter.classroomId;
    } else if (user.role !== 'ADMIN' && teacherId) {
      // Limit to teacher's classes
      sessionWhere.classroom = {
        isActive: true,
        deletedAt: null,
        OR: [
          { teacherId },
          { teachingAssignments: { some: { teacherId, isActive: true } } },
        ],
      };
    }

    if (filter.schoolYearId) {
      sessionWhere.classroom = {
        ...sessionWhere.classroom,
        schoolYearId: filter.schoolYearId,
      };
    }

    if (filter.dateFrom || filter.dateTo) {
      sessionWhere.attendanceDate = {};
      if (filter.dateFrom) sessionWhere.attendanceDate.gte = new Date(filter.dateFrom);
      if (filter.dateTo) sessionWhere.attendanceDate.lte = new Date(filter.dateTo);
    }

    const sessions = await this.prisma.attendanceSession.findMany({
      where: sessionWhere,
      include: {
        classroom: { select: { id: true, name: true, grade: { select: { name: true } } } },
        attendances: {
          include: {
            student: { select: { id: true, fullName: true, gender: true } },
          },
        },
      },
      orderBy: { attendanceDate: 'desc' },
      take: 200,
    });

    let totalAttendances = 0;
    let presentCount = 0;
    let excusedCount = 0;
    let unexcusedCount = 0;
    let lateCount = 0;

    const studentAbsenceMap = new Map<string, { student: any; className: string; excused: number; unexcused: number; late: number }>();

    for (const s of sessions) {
      for (const att of s.attendances) {
        totalAttendances++;
        if (att.status === 'PRESENT') presentCount++;
        else if (att.status === 'EXCUSED_ABSENCE') excusedCount++;
        else if (att.status === 'UNEXCUSED_ABSENCE') unexcusedCount++;
        else if (att.status === 'LATE') lateCount++;

        if (att.status !== 'PRESENT') {
          const sid = att.studentId;
          const curr = studentAbsenceMap.get(sid) || {
            student: att.student,
            className: s.classroom?.name || 'N/A',
            excused: 0,
            unexcused: 0,
            late: 0,
          };
          if (att.status === 'EXCUSED_ABSENCE') curr.excused++;
          if (att.status === 'UNEXCUSED_ABSENCE') curr.unexcused++;
          if (att.status === 'LATE') curr.late++;
          studentAbsenceMap.set(sid, curr);
        }
      }
    }

    const attendanceRate = totalAttendances > 0 ? Math.round((presentCount / totalAttendances) * 100) : 100;
    const studentsWithAbsences = Array.from(studentAbsenceMap.values())
      .sort((a, b) => (b.unexcused * 2 + b.excused + b.late) - (a.unexcused * 2 + a.excused + a.late));

    return {
      summary: {
        totalSessions: sessions.length,
        totalRecords: totalAttendances,
        presentCount,
        excusedCount,
        unexcusedCount,
        lateCount,
        attendanceRate,
      },
      studentsWithAbsences,
      sessions: sessions.map((s) => ({
        id: s.id,
        date: s.attendanceDate,
        className: s.classroom?.name,
        totalStudents: s.attendances.length,
        present: s.attendances.filter((a) => a.status === 'PRESENT').length,
        excused: s.attendances.filter((a) => a.status === 'EXCUSED_ABSENCE').length,
        unexcused: s.attendances.filter((a) => a.status === 'UNEXCUSED_ABSENCE').length,
        late: s.attendances.filter((a) => a.status === 'LATE').length,
      })),
    };
  }

  /**
   * 2. ASSESSMENT REPORT
   */
  async getAssessmentReport(filter: ReportFilterDto, user: AuthenticatedUser) {
    const teacherId = await this.getTeacherId(user);

    if (filter.classroomId) {
      await this.validateClassroomAccess(filter.classroomId, user);
    }

    const whereClause: any = {};
    if (filter.classroomId) {
      whereClause.classroomId = filter.classroomId;
    } else if (user.role !== 'ADMIN' && teacherId) {
      whereClause.classroom = {
        isActive: true,
        deletedAt: null,
        OR: [
          { teacherId },
          { teachingAssignments: { some: { teacherId, isActive: true } } },
        ],
      };
    }

    if (filter.subjectId) {
      whereClause.subjectId = filter.subjectId;
    }

    if (filter.schoolYearId) {
      whereClause.classroom = {
        ...whereClause.classroom,
        schoolYearId: filter.schoolYearId,
      };
    }

    const assessments = await this.prisma.assessment.findMany({
      where: whereClause,
      include: {
        classroom: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        studentAssessments: {
          include: {
            student: { select: { id: true, fullName: true, gender: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    let totalEntries = 0;
    let excellentCount = 0;
    let completedCount = 0;
    let needsSupportCount = 0;

    for (const asm of assessments) {
      for (const sa of asm.studentAssessments) {
        totalEntries++;
        if (sa.level === 'EXCELLENT') excellentCount++;
        else if (sa.level === 'COMPLETED') completedCount++;
        else if (sa.level === 'NEEDS_SUPPORT') needsSupportCount++;
      }
    }

    const excellentRate = totalEntries > 0 ? Math.round((excellentCount / totalEntries) * 100) : 0;
    const completedRate = totalEntries > 0 ? Math.round((completedCount / totalEntries) * 100) : 0;
    const needsSupportRate = totalEntries > 0 ? Math.round((needsSupportCount / totalEntries) * 100) : 0;

    return {
      summary: {
        totalAssessments: assessments.length,
        totalStudentAssessments: totalEntries,
        excellentCount,
        completedCount,
        needsSupportCount,
        excellentRate,
        completedRate,
        needsSupportRate,
      },
      assessments: assessments.map((a) => ({
        id: a.id,
        title: a.title,
        status: a.status,
        className: a.classroom?.name,
        subjectName: a.subject?.name,
        date: a.assessmentDate || a.createdAt,
        totalStudents: a.studentAssessments.length,
        excellent: a.studentAssessments.filter((sa) => sa.level === 'EXCELLENT').length,
        completed: a.studentAssessments.filter((sa) => sa.level === 'COMPLETED').length,
        needsSupport: a.studentAssessments.filter((sa) => sa.level === 'NEEDS_SUPPORT').length,
      })),
    };
  }

  /**
   * 3. CLASSROOM SUMMARY REPORT
   */
  async getClassroomSummaryReport(classroomId: string, user: AuthenticatedUser) {
    await this.validateClassroomAccess(classroomId, user);

    const classroom: any = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      include: {
        grade: true,
        schoolYear: true,
        teacher: { select: { fullName: true, phone: true, avatarUrl: true } },
        studentEnrollments: {
          where: { status: 'ACTIVE' },
          include: {
            student: true,
          },
          orderBy: { student: { fullName: 'asc' } },
        },
        studentBehaviorRecords: {
          orderBy: { recordDate: 'desc' },
          take: 50,
          include: { student: { select: { id: true, fullName: true } } },
        },
        attendanceSessions: {
          include: { attendances: true },
          orderBy: { attendanceDate: 'desc' },
          take: 30,
        },
      },
    });

    if (!classroom || classroom.deletedAt) {
      throw new NotFoundException('Không tìm thấy lớp học');
    }

    const totalStudents = classroom.studentEnrollments?.length || 0;
    const maleCount = classroom.studentEnrollments?.filter((e: any) => e.student.gender === 'MALE').length || 0;
    const femaleCount = classroom.studentEnrollments?.filter((e: any) => e.student.gender === 'FEMALE').length || 0;

    // Attendance stats
    let totalAttendance = 0;
    let presentAttendance = 0;
    for (const session of classroom.attendanceSessions || []) {
      for (const rec of session.attendances || []) {
        totalAttendance++;
        if (rec.status === 'PRESENT') presentAttendance++;
      }
    }
    const attendanceRate = totalAttendance > 0 ? Math.round((presentAttendance / totalAttendance) * 100) : 100;

    // Behavior stats
    const behaviorList = classroom.studentBehaviorRecords || [];
    const positiveBehaviorCount = behaviorList.filter((b: any) => b.level === 'POSITIVE').length;
    const reminderBehaviorCount = behaviorList.filter((b: any) => b.level === 'REMINDER').length;
    const needsAttentionBehaviorCount = behaviorList.filter((b: any) => b.level === 'NEEDS_ATTENTION').length;

    return {
      classInfo: {
        id: classroom.id,
        name: classroom.name,
        code: classroom.code,
        grade: classroom.grade?.name || 'Khối',
        schoolYear: classroom.schoolYear?.name || 'Năm học',
        homeroomTeacher: classroom.teacher?.fullName || 'Chưa phân công',
        phone: classroom.teacher?.phone,
        room: classroom.room || 'Chưa cập nhật',
      },
      students: {
        total: totalStudents,
        male: maleCount,
        female: femaleCount,
        list: (classroom.studentEnrollments || []).map((e: any, idx: number) => ({
          stt: idx + 1,
          id: e.student.id,
          code: e.student.studentCode,
          fullName: e.student.fullName,
          gender: e.student.gender === 'MALE' ? 'Nam' : e.student.gender === 'FEMALE' ? 'Nữ' : 'Khác',
          dob: e.student.dateOfBirth,
          status: e.student.status,
        })),
      },
      attendance: {
        totalSessionsTracked: (classroom.attendanceSessions || []).length,
        overallAttendanceRate: attendanceRate,
      },
      behavior: {
        totalRecords: behaviorList.length,
        positive: positiveBehaviorCount,
        reminder: reminderBehaviorCount,
        needsAttention: needsAttentionBehaviorCount,
        recentRecords: behaviorList.slice(0, 10).map((r: any) => ({
          studentName: r.student?.fullName || 'Học sinh',
          category: r.category,
          level: r.level,
          content: r.content,
          date: r.recordDate,
        })),
      },
    };
  }

  /**
   * 4. TEACHING ASSIGNMENTS REPORT
   */
  async getTeachingAssignmentsReport(filter: ReportFilterDto, user: AuthenticatedUser) {
    const teacherId = await this.getTeacherId(user);

    const whereClause: any = { isActive: true };

    if (filter.schoolYearId) {
      whereClause.schoolYearId = filter.schoolYearId;
    }

    if (user.role !== 'ADMIN' && teacherId) {
      whereClause.teacherId = teacherId;
    } else if (filter.teacherId) {
      whereClause.teacherId = filter.teacherId;
    }

    if (filter.classroomId) {
      whereClause.classroomId = filter.classroomId;
    }

    if (filter.subjectId) {
      whereClause.subjectId = filter.subjectId;
    }

    const assignments = await this.prisma.teachingAssignment.findMany({
      where: whereClause,
      include: {
        teacher: { select: { id: true, fullName: true, phone: true } },
        classroom: { select: { id: true, name: true, grade: { select: { name: true } } } },
        subject: { select: { id: true, name: true, code: true } },
        schoolYear: { select: { id: true, name: true } },
      },
      orderBy: [
        { teacher: { fullName: 'asc' } },
        { classroom: { name: 'asc' } },
      ],
    });

    const teacherMap = new Map<string, { teacherName: string; phone?: string; assignments: any[] }>();

    for (const a of assignments) {
      const tid = a.teacherId;
      const curr = teacherMap.get(tid) || {
        teacherName: a.teacher.fullName,
        phone: a.teacher.phone || undefined,
        assignments: [],
      };
      curr.assignments.push({
        id: a.id,
        className: a.classroom.name,
        gradeName: a.classroom.grade.name,
        subjectName: a.subject.name,
        schoolYearName: a.schoolYear.name,
      });
      teacherMap.set(tid, curr);
    }

    return {
      totalAssignments: assignments.length,
      totalTeachers: teacherMap.size,
      byTeacher: Array.from(teacherMap.values()),
      list: assignments.map((a) => ({
        id: a.id,
        teacherName: a.teacher.fullName,
        className: a.classroom.name,
        subjectName: a.subject.name,
        schoolYearName: a.schoolYear.name,
      })),
    };
  }

  /**
   * 5. STUDENT ENROLLMENT REPORT
   */
  async getStudentEnrollmentReport(filter: ReportFilterDto, user: AuthenticatedUser) {
    const whereClause: any = {};

    if (filter.schoolYearId) {
      whereClause.schoolYearId = filter.schoolYearId;
    }

    if (filter.classroomId) {
      await this.validateClassroomAccess(filter.classroomId, user);
      whereClause.classroomId = filter.classroomId;
    } else if (user.role !== 'ADMIN') {
      const teacherId = await this.getTeacherId(user);
      if (teacherId) {
        whereClause.classroom = {
          isActive: true,
          deletedAt: null,
          teacherId,
        };
      }
    }

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: whereClause,
      include: {
        student: true,
        classroom: { include: { grade: true, schoolYear: true } },
      },
      orderBy: [
        { classroom: { name: 'asc' } },
        { student: { fullName: 'asc' } },
      ],
    });

    const classSummaryMap = new Map<string, { className: string; gradeName: string; active: number; transferred: number; completed: number; withdrawn: number; total: number }>();

    for (const e of enrollments) {
      const cid = e.classroomId;
      const curr = classSummaryMap.get(cid) || {
        className: e.classroom.name,
        gradeName: e.classroom.grade.name,
        active: 0,
        transferred: 0,
        completed: 0,
        withdrawn: 0,
        total: 0,
      };
      curr.total++;
      if (e.status === 'ACTIVE') curr.active++;
      else if (e.status === 'TRANSFERRED') curr.transferred++;
      else if (e.status === 'COMPLETED') curr.completed++;
      else if (e.status === 'WITHDRAWN') curr.withdrawn++;
      classSummaryMap.set(cid, curr);
    }

    return {
      totalEnrollments: enrollments.length,
      activeEnrollments: enrollments.filter((e) => e.status === 'ACTIVE').length,
      classBreakdown: Array.from(classSummaryMap.values()),
      students: enrollments.slice(0, 100).map((e) => ({
        id: e.id,
        studentId: e.student.id,
        fullName: e.student.fullName,
        code: e.student.studentCode,
        gender: e.student.gender === 'MALE' ? 'Nam' : e.student.gender === 'FEMALE' ? 'Nữ' : 'Khác',
        className: e.classroom.name,
        status: e.status,
        enrollmentDate: e.enrolledAt,
      })),
    };
  }

  /**
   * 6. EXPORT CSV UTILITIES
   */
  async exportAttendanceReportCsv(filter: ReportFilterDto, user: AuthenticatedUser): Promise<string> {
    const data = await this.getAttendanceReport(filter, user);
    const rows = [
      ['BÁO CÁO CHUYÊN CẦN'],
      ['Tổng số buổi', String(data.summary.totalSessions)],
      ['Tỷ lệ chuyên cần', `${data.summary.attendanceRate}%`],
      ['Đi học đúng giờ', String(data.summary.presentCount)],
      ['Vắng có phép', String(data.summary.excusedCount)],
      ['Vắng không phép', String(data.summary.unexcusedCount)],
      ['Đi muộn', String(data.summary.lateCount)],
      [],
      ['DANH SÁCH HỌC SINH CẦN LƯU Ý CHUYÊN CẦN'],
      ['Họ và tên', 'Lớp', 'Vắng có phép', 'Vắng không phép', 'Đi muộn'],
      ...data.studentsWithAbsences.map((s) => [
        `"${s.student.fullName}"`,
        `"${s.className}"`,
        String(s.excused),
        String(s.unexcused),
        String(s.late),
      ]),
    ];

    // Prepend UTF-8 BOM for Excel Vietnamese character compatibility
    return '\uFEFF' + rows.map((r) => r.join(',')).join('\r\n');
  }

  async exportAssessmentReportCsv(filter: ReportFilterDto, user: AuthenticatedUser): Promise<string> {
    const data = await this.getAssessmentReport(filter, user);
    const rows = [
      ['BÁO CÁO TỔNG HỢP ĐÁNH GIÁ'],
      ['Tổng số lượt đánh giá', String(data.summary.totalStudentAssessments)],
      ['Hoàn thành tốt', `${data.summary.excellentCount} (${data.summary.excellentRate}%)`],
      ['Hoàn thành', `${data.summary.completedCount} (${data.summary.completedRate}%)`],
      ['Cần hỗ trợ', `${data.summary.needsSupportCount} (${data.summary.needsSupportRate}%)`],
      [],
      ['CHI TIẾT CÁC ĐỢT ĐÁNH GIÁ'],
      ['Tên bài đánh giá', 'Trạng thái', 'Lớp', 'Môn học', 'Hoàn thành tốt', 'Hoàn thành', 'Cần hỗ trợ'],
      ...data.assessments.map((a) => [
        `"${a.title}"`,
        `"${a.status}"`,
        `"${a.className || ''}"`,
        `"${a.subjectName || ''}"`,
        String(a.excellent),
        String(a.completed),
        String(a.needsSupport),
      ]),
    ];

    return '\uFEFF' + rows.map((r) => r.join(',')).join('\r\n');
  }

  /**
   * 7. EXPORT CLASSROOM SUMMARY DOCX
   */
  async exportClassroomSummaryDocx(classroomId: string, user: AuthenticatedUser): Promise<Buffer> {
    const data = await this.getClassroomSummaryReport(classroomId, user);

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: 'BÁO CÁO TỔNG HỢP LỚP HỌC',
                  bold: true,
                  size: 32,
                  font: 'Arial',
                  color: '0D9488',
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: `Lớp: ${data.classInfo.name} — Khối: ${data.classInfo.grade} — Năm học: ${data.classInfo.schoolYear}`,
                  italics: true,
                  size: 22,
                  font: 'Arial',
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: `Giáo viên chủ nhiệm: ${data.classInfo.homeroomTeacher}`,
                  bold: true,
                  size: 22,
                  font: 'Arial',
                }),
              ],
            }),
            new Paragraph({ text: '' }),

            // Section 1: Sĩ số
            new Paragraph({
              children: [
                new TextRun({
                  text: `I. SĨ SỐ HỌC SINH: ${data.students.total} học sinh (Nam: ${data.students.male}, Nữ: ${data.students.female})`,
                  bold: true,
                  size: 24,
                  font: 'Arial',
                }),
              ],
            }),
            new Paragraph({ text: '' }),

            // Section 2: Chuyên cần
            new Paragraph({
              children: [
                new TextRun({
                  text: `II. TÌNH HÌNH CHUYÊN CẦN: Tỷ lệ đi học đúng giờ đạt ${data.attendance.overallAttendanceRate}%`,
                  bold: true,
                  size: 24,
                  font: 'Arial',
                }),
              ],
            }),
            new Paragraph({ text: '' }),

            // Section 3: Rèn luyện nề nếp
            new Paragraph({
              children: [
                new TextRun({
                  text: `III. NỀ NẾP & HÀNH VI: Tích cực (${data.behavior.positive}), Nhắc nhở (${data.behavior.reminder}), Cần lưu ý (${data.behavior.needsAttention})`,
                  bold: true,
                  size: 24,
                  font: 'Arial',
                }),
              ],
            }),
            new Paragraph({ text: '' }),

            // Table of students
            new Paragraph({
              children: [
                new TextRun({
                  text: 'IV. DANH SÁCH HỌC SINH LỚP',
                  bold: true,
                  size: 24,
                  font: 'Arial',
                }),
              ],
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'STT', bold: true })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Mã HS', bold: true })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Họ và tên', bold: true })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Giới tính', bold: true })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Học lực', bold: true })] })] }),
                  ],
                }),
                ...data.students.list.map(
                  (s: any) =>
                    new TableRow({
                      children: [
                        new TableCell({ children: [new Paragraph(String(s.stt))] }),
                        new TableCell({ children: [new Paragraph(s.code || '-')] }),
                        new TableCell({ children: [new Paragraph(s.fullName)] }),
                        new TableCell({ children: [new Paragraph(s.gender)] }),
                        new TableCell({ children: [new Paragraph(s.status)] }),
                      ],
                    }),
                ),
              ],
            }),
          ],
        },
      ],
    });

    return await Packer.toBuffer(doc);
  }
}
