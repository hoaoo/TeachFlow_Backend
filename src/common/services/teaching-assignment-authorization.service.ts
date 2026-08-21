import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TeachingAssignmentAuthorizationService {
  private readonly logger = new Logger(TeachingAssignmentAuthorizationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Validate and load an active TeachingAssignment for resource creation.
   * Ensures the assignment exists, is active, and belongs to the current teacher (unless admin).
   */
  async validateAssignmentForCreate(
    teachingAssignmentId: string,
    currentTeacherId?: string,
    isAdmin = false,
  ) {
    const assignment = await this.prisma.teachingAssignment.findUnique({
      where: { id: teachingAssignmentId },
      include: {
        teacher: true,
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException(`Không tìm thấy phân công giảng dạy với mã ${teachingAssignmentId}`);
    }

    if (!assignment.isActive) {
      throw new BadRequestException('Phân công giảng dạy này đã bị vô hiệu hóa, không thể tạo mới tài nguyên');
    }

    if (!isAdmin && currentTeacherId && assignment.teacherId !== currentTeacherId) {
      this.logger.warn(
        `[SECURITY_IDOR_ATTEMPT] Teacher ${currentTeacherId} attempted to use assignment ${teachingAssignmentId} owned by ${assignment.teacherId}`,
      );
      throw new ForbiddenException('Bạn không có quyền sử dụng phân công giảng dạy của giáo viên khác');
    }

    return assignment;
  }

  /**
   * Adapter for legacy requests sending (teacherId, classroomId, subjectId):
   * Resolves exactly 1 active TeachingAssignment or rejects.
   */
  async resolveAssignmentFromContext(
    params: {
      teacherId: string;
      classroomId: string;
      subjectId?: string;
      schoolYearId?: string;
    },
    isAdmin = false,
  ) {
    const where: any = {
      teacherId: params.teacherId,
      classroomId: params.classroomId,
      isActive: true,
    };

    if (params.subjectId) {
      where.subjectId = params.subjectId;
    }

    if (params.schoolYearId) {
      where.schoolYearId = params.schoolYearId;
    }

    const matches = await this.prisma.teachingAssignment.findMany({
      where,
      include: {
        teacher: true,
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
      },
    });

    if (matches.length === 0) {
      // Auto-declare teaching assignment if teacher owns the classroom
      const classroom = await this.prisma.classroom.findUnique({
        where: { id: params.classroomId },
      });

      if (classroom && !classroom.deletedAt && (classroom.teacherId === params.teacherId || isAdmin)) {
        let subjectId = params.subjectId;
        if (!subjectId) {
          const defaultSubject = await this.prisma.subject.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'asc' },
          });
          subjectId = defaultSubject?.id;
        }

        if (subjectId) {
          const created = await this.prisma.teachingAssignment.create({
            data: {
              teacherId: params.teacherId,
              classroomId: params.classroomId,
              subjectId,
              schoolYearId: params.schoolYearId || classroom.schoolYearId,
              isActive: true,
            },
            include: {
              teacher: true,
              classroom: { include: { grade: true } },
              subject: true,
              schoolYear: true,
            },
          });
          return created;
        }
      }

      throw new ForbiddenException('Không tìm thấy phân công giảng dạy đang hoạt động phù hợp với yêu cầu này');
    }

    if (matches.length > 1) {
      throw new ConflictException(
        'Tồn tại nhiều phân công giảng dạy phù hợp (nhiều môn học), vui lòng truyền chính xác teachingAssignmentId',
      );
    }

    return matches[0];
  }

  /**
   * Verify temporal enrollment: student must have valid enrollment in classroom on the given date.
   */
  async assertStudentEnrolledAtDate(classroomId: string, studentId: string, date: Date) {
    const targetDate = new Date(date);
    targetDate.setHours(23, 59, 59, 999);

    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: {
        classroomId,
        studentId,
        enrolledAt: { lte: targetDate },
        OR: [
          { leftAt: null },
          { leftAt: { gte: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0) } },
        ],
        status: { in: ['ACTIVE', 'TRANSFERRED', 'COMPLETED'] },
      },
    });

    if (!enrollment) {
      this.logger.warn(
        `[SECURITY_STUDENT_MEMBERSHIP_VIOLATION] Student ${studentId} is not enrolled in classroom ${classroomId} on date ${date.toISOString()}`,
      );
      throw new BadRequestException(
        `Học sinh với mã ${studentId} không thuộc danh sách lớp học tại thời điểm ${date.toLocaleDateString('vi-VN')}`,
      );
    }

    return enrollment;
  }

  /**
   * Bulk verify students enrollment in a classroom.
   */
  async assertStudentsEnrolled(classroomId: string, studentIds: string[], date?: Date) {
    for (const sId of studentIds) {
      if (date) {
        await this.assertStudentEnrolledAtDate(classroomId, sId, date);
      } else {
        const enrollment = await this.prisma.studentEnrollment.findFirst({
          where: {
            classroomId,
            studentId: sId,
            status: { in: ['ACTIVE', 'COMPLETED'] },
          },
        });
        if (!enrollment) {
          throw new BadRequestException(
            `Học sinh với mã ${sId} không thuộc danh sách lớp học này`,
          );
        }
      }
    }
  }

  /**
   * Verify teacher access to a Classroom's attendance session:
   * Teacher is either homeroom teacher of classroom OR has an active TeachingAssignment in that classroom.
   */
  async assertTeacherCanAccessClassroomAttendance(
    classroomId: string,
    teacherId: string,
    isAdmin = false,
  ) {
    if (isAdmin) return true;

    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      include: { teachingAssignments: { where: { teacherId, isActive: true } } },
    });

    if (!classroom || classroom.deletedAt) {
      throw new NotFoundException(`Không tìm thấy lớp học với mã ${classroomId}`);
    }

    const isHomeroom = classroom.teacherId === teacherId;
    const hasAssignment = (classroom.teachingAssignments || []).length > 0;

    if (!isHomeroom && !hasAssignment) {
      this.logger.warn(
        `[SECURITY_ATTENDANCE_ACCESS_DENIED] Teacher ${teacherId} denied attendance access for classroom ${classroomId}`,
      );
      throw new ForbiddenException('Bạn không có quyền quản lý điểm danh của lớp học này');
    }

    return true;
  }
}
