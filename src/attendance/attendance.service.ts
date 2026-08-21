import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';
import { SaveAttendanceDto, AttendanceStatusEnum } from './dto/save-attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private assignmentAuth: TeachingAssignmentAuthorizationService,
  ) {}

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

    // Fetch students active on targetDate via StudentEnrollment (temporal accuracy)
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

    const session = await this.prisma.attendanceSession.findUnique({
      where: {
        classroomId_attendanceDate: {
          classroomId: classId,
          attendanceDate: targetDate,
        },
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

    // Validate that every submitted student has a valid enrollment at targetDate
    await this.assignmentAuth.assertStudentsEnrolled(
      dto.classId,
      dto.attendances.map((a) => a.studentId),
      targetDate,
    );

    // Try finding matching assignment for teacher in this classroom
    const assignment = await this.prisma.teachingAssignment.findFirst({
      where: { teacherId, classroomId: dto.classId, isActive: true },
    });

    return this.prisma.$transaction(async (tx) => {
      let session = await tx.attendanceSession.findUnique({
        where: {
          classroomId_attendanceDate: {
            classroomId: dto.classId,
            attendanceDate: targetDate,
          },
        },
      });

      const presentCount = dto.attendances.filter((a) => a.status === AttendanceStatusEnum.PRESENT).length;
      const absentCount = dto.attendances.filter((a) => a.status === AttendanceStatusEnum.EXCUSED_ABSENCE || a.status === AttendanceStatusEnum.UNEXCUSED_ABSENCE).length;

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
          },
        });
      } else {
        session = await tx.attendanceSession.update({
          where: { id: session.id },
          data: {
            title,
            meta,
            status: 'Đã điểm danh',
          },
        });
      }

      // Upsert student attendances
      for (const item of dto.attendances) {
        await tx.studentAttendance.upsert({
          where: {
            attendanceSessionId_studentId: {
              attendanceSessionId: session.id,
              studentId: item.studentId,
            },
          },
          update: {
            status: item.status || AttendanceStatusEnum.PRESENT,
            note: item.note,
          },
          create: {
            attendanceSessionId: session.id,
            studentId: item.studentId,
            status: item.status || AttendanceStatusEnum.PRESENT,
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
