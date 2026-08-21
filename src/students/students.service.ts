import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';

@Injectable()
export class StudentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: PaginationQueryDto & { classId?: string; status?: string }, teacherId?: string) {
    const { page = 1, pageSize = 20, keyword, classId } = query;
    const skip = (page - 1) * pageSize;

    const where: any = {
      deletedAt: null,
    };

    if (teacherId) {
      where.classStudents = {
        some: {
          classroom: { teacherId, deletedAt: null },
          status: 'ACTIVE',
        },
      };
    }

    if (classId && classId !== 'Tất cả') {
      where.classStudents = {
        some: {
          OR: [
            { classroomId: classId },
            { classroom: { name: classId } },
          ],
          status: 'ACTIVE',
        },
      };
    }

    if (keyword) {
      where.OR = [
        { fullName: { contains: keyword, mode: 'insensitive' } },
        { studentCode: { contains: keyword, mode: 'insensitive' } },
        { parentName: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [totalItems, students] = await Promise.all([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          classStudents: {
            where: { status: 'ACTIVE' },
            include: { classroom: true },
          },
          comments: {
            orderBy: { commentDate: 'desc' },
            take: 1,
          },
        },
        orderBy: { fullName: 'asc' },
      }),
    ]);

    const items = students.map((s) => this.mapStudentRecord(s));
    return new PaginatedResultDto(items, totalItems, page, pageSize);
  }

  async findOne(id: string, teacherId?: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        classStudents: {
          where: { status: 'ACTIVE' },
          include: { classroom: true },
        },
        comments: {
          orderBy: { commentDate: 'desc' },
        },
        studentAttendances: {
          include: { attendanceSession: true },
          orderBy: { createdAt: 'desc' },
        },
        studentAssessments: {
          include: { assessment: true, criterion: true },
        },
      },
    });

    if (!student || student.deletedAt) {
      throw new NotFoundException(`Không tìm thấy học sinh với mã ${id}`);
    }

    if (teacherId) {
      const classStudentClassIds = student.classStudents.map((cs) => cs.classroomId);
      const isHomeroom = student.classStudents.some(
        (cs) => cs.classroom.teacherId === teacherId,
      );

      let hasAccess = isHomeroom;
      if (!hasAccess && classStudentClassIds.length > 0) {
        const assignedCount = await this.prisma.teachingAssignment.count({
          where: {
            teacherId,
            classroomId: { in: classStudentClassIds },
            isActive: true,
          },
        });
        hasAccess = assignedCount > 0;
      }

      if (!hasAccess) {
        throw new ForbiddenException('Bạn không có quyền truy cập thông tin học sinh này');
      }
    }

    return this.mapStudentRecord(student);
  }

  async create(dto: CreateStudentDto, teacherId: string) {
    let classId = dto.classId;
    if (!classId && teacherId) {
      const teacherClass = await this.prisma.classroom.findFirst({
        where: { teacherId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (teacherClass) {
        classId = teacherClass.id;
      }
    }

    let classroom: any = null;
    if (classId) {
      classroom = await this.prisma.classroom.findUnique({
        where: { id: classId },
      });
      if (!classroom || classroom.deletedAt || (teacherId && classroom.teacherId !== teacherId)) {
        throw new ForbiddenException('Bạn không có quyền thêm học sinh vào lớp học này');
      }

      const existingInClass = await this.prisma.classStudent.findFirst({
        where: {
          classroomId: classId,
          status: 'ACTIVE',
          student: {
            fullName: dto.fullName.trim(),
            deletedAt: null,
          },
        },
      });

      if (existingInClass) {
        throw new ConflictException(`Học sinh "${dto.fullName.trim()}" đã có tên trong danh sách lớp`);
      }
    }

    const initials =
      dto.initials ||
      dto.fullName
        .trim()
        .split(' ')
        .map((p) => p[0])
        .slice(-2)
        .join('')
        .toUpperCase();

    return this.prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: {
          fullName: dto.fullName.trim(),
          initials,
          gender: dto.gender === 'Nữ' ? 'FEMALE' : 'MALE',
          dobString: dto.dob || 'Chưa cập nhật',
          parentName: dto.parentName || 'Chưa cập nhật',
          parentPhone: dto.parentPhone || 'Chưa cập nhật',
          avatarColor: dto.color || 'bg-teal-100 text-teal-700',
          status: dto.status === 'Tốt' ? 'EXCELLENT' : dto.status === 'Cần cố gắng' ? 'NEEDS_SUPPORT' : 'GOOD',
        },
      });

      if (classId && classroom) {
        await tx.studentEnrollment.create({
          data: {
            studentId: student.id,
            schoolYearId: classroom.schoolYearId,
            classroomId: classId,
            status: 'ACTIVE',
            enrolledAt: new Date(),
            note: dto.note,
          },
        });

        await tx.classStudent.create({
          data: {
            classroomId: classId,
            studentId: student.id,
            status: 'ACTIVE',
          },
        });

        if (dto.note) {
          await tx.studentComment.create({
            data: {
              studentId: student.id,
              teacherId,
              classroomId: classId,
              content: dto.note,
            },
          });
        }
      }

      const created = await tx.student.findUnique({
        where: { id: student.id },
        include: {
          classStudents: {
            where: { status: 'ACTIVE' },
            include: { classroom: true },
          },
          comments: {
            orderBy: { commentDate: 'desc' },
          },
          studentAttendances: {
            include: { attendanceSession: true },
            orderBy: { createdAt: 'desc' },
          },
          studentAssessments: {
            include: { assessment: true, criterion: true },
          },
        },
      });

      return this.mapStudentRecord(created);
    });
  }

  async update(id: string, dto: UpdateStudentDto, teacherId: string) {
    await this.findOne(id, teacherId);

    const data: any = {};
    if (dto.fullName) data.fullName = dto.fullName;
    if (dto.initials) data.initials = dto.initials;
    if (dto.gender) data.gender = dto.gender === 'Nữ' ? 'FEMALE' : 'MALE';
    if (dto.dob) data.dobString = dto.dob;
    if (dto.parentName) data.parentName = dto.parentName;
    if (dto.parentPhone) data.parentPhone = dto.parentPhone;
    if (dto.color) data.avatarColor = dto.color;
    if (dto.status) {
      data.status =
        dto.status === 'Tốt' ? 'EXCELLENT' : dto.status === 'Cần cố gắng' ? 'NEEDS_SUPPORT' : 'GOOD';
    }

    await this.prisma.student.update({
      where: { id },
      data,
    });

    return this.findOne(id, teacherId);
  }

  async remove(id: string, teacherId: string) {
    await this.findOne(id, teacherId);

    await this.prisma.student.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true, message: 'Đã xóa học sinh' };
  }

  async getOverview(id: string, teacherId: string) {
    const student = await this.findOne(id, teacherId);
    return {
      student,
      progress: [
        { subject: 'Toán', score: 9.1, percentage: 91, trend: '+0.6', color: 'bg-teal-500' },
        { subject: 'Tiếng Việt', score: 8.7, percentage: 87, trend: '+0.4', color: 'bg-blue-500' },
        { subject: 'Khoa học', score: 8.9, percentage: 89, trend: '+0.8', color: 'bg-orange-500' },
        { subject: 'Lịch sử & Địa lý', score: 8.2, percentage: 82, trend: '+0.2', color: 'bg-purple-500' },
      ],
      stats: {
        progress: student.progress,
        attendance: student.attendance,
        commentsCount: 12,
        goals: '3/4',
      },
      latestNote: student.note,
    };
  }

  async getAttendance(id: string, teacherId: string) {
    await this.findOne(id, teacherId);

    const attendances = await this.prisma.studentAttendance.findMany({
      where: { studentId: id },
      include: { attendanceSession: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const statusMap: Record<string, string> = {
      PRESENT: 'Có mặt',
      EXCUSED_ABSENCE: 'Nghỉ có phép',
      UNEXCUSED_ABSENCE: 'Nghỉ không phép',
      LATE: 'Đi muộn',
    };

    if (!attendances.length) {
      return [
        { date: '20/08/2026', type: 'Có mặt', note: 'Đúng giờ' },
        { date: '19/08/2026', type: 'Có mặt', note: 'Đúng giờ' },
        { date: '18/08/2026', type: 'Đi muộn', note: 'Muộn 10 phút' },
        { date: '17/08/2026', type: 'Có mặt', note: 'Đúng giờ' },
      ];
    }

    return attendances.map((a) => ({
      date: new Date(a.attendanceSession.attendanceDate).toLocaleDateString('vi-VN'),
      type: statusMap[a.status] || 'Có mặt',
      note: a.note || (a.status === 'LATE' ? 'Đi muộn' : 'Đúng giờ'),
    }));
  }

  async getAssessments(id: string, teacherId: string) {
    await this.findOne(id, teacherId);

    return [
      { subject: 'Toán', score: 9.1, average: 9.1 },
      { subject: 'Tiếng Việt', score: 8.7, average: 8.7 },
      { subject: 'Khoa học', score: 8.9, average: 8.9 },
      { subject: 'Lịch sử & Địa lý', score: 8.2, average: 8.2 },
    ];
  }

  async getComments(id: string, teacherId: string) {
    await this.findOne(id, teacherId);

    const comments = await this.prisma.studentComment.findMany({
      where: { studentId: id },
      include: { teacher: true },
      orderBy: { commentDate: 'desc' },
    });

    return comments.map((c) => ({
      id: c.id,
      content: c.content,
      date: new Date(c.commentDate).toLocaleDateString('vi-VN'),
      teacherName: c.teacher?.fullName || 'Giáo viên',
    }));
  }

  async getEnrollments(id: string, teacherId?: string) {
    await this.findOne(id, teacherId);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { studentId: id },
      include: {
        schoolYear: true,
        classroom: { include: { grade: true } },
      },
      orderBy: [
        { schoolYear: { startDate: 'desc' } },
        { enrolledAt: 'desc' },
      ],
    });

    return enrollments.map((e) => ({
      id: e.id,
      schoolYearId: e.schoolYearId,
      schoolYear: e.schoolYear ? { id: e.schoolYear.id, name: e.schoolYear.name, isCurrent: e.schoolYear.isCurrent } : undefined,
      classroomId: e.classroomId,
      classroom: e.classroom ? { id: e.classroom.id, code: e.classroom.code, name: e.classroom.name, gradeName: e.classroom.grade?.name } : undefined,
      status: e.status,
      enrolledAt: e.enrolledAt,
      leftAt: e.leftAt,
      transferReason: e.transferReason,
      note: e.note,
    }));
  }

  private mapStudentRecord(s: any) {
    const statusMap: Record<string, string> = {
      EXCELLENT: 'Tốt',
      GOOD: 'Khá',
      NEEDS_SUPPORT: 'Cần cố gắng',
    };
    const genderMap: Record<string, string> = {
      MALE: 'Nam',
      FEMALE: 'Nữ',
      OTHER: 'Khác',
    };

    const firstClass = s.classStudents?.[0]?.classroom;
    const latestComment = s.comments?.[0]?.content || 'Chưa có nhận xét.';

    return {
      id: s.id,
      name: s.fullName,
      initials: s.initials || s.fullName.slice(0, 2).toUpperCase(),
      gender: genderMap[s.gender] || 'Nam',
      dob: s.dobString || (s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString('vi-VN') : 'Chưa cập nhật'),
      guardian: s.parentName || 'Chưa cập nhật',
      phone: s.parentPhone || 'Chưa cập nhật',
      progress: s.status === 'EXCELLENT' ? 92 : s.status === 'GOOD' ? 84 : 70,
      status: statusMap[s.status] || 'Khá',
      attendance: 96,
      note: latestComment,
      color: s.avatarColor || 'bg-teal-100 text-teal-700',
      className: firstClass?.name || 'Lớp 4A',
      classId: firstClass?.id || '4a',
    };
  }
}
