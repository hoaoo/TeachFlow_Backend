import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassroomDto } from './dto/create-classroom.dto';
import { UpdateClassroomDto } from './dto/update-classroom.dto';
import { AddStudentToClassDto } from './dto/add-student-to-class.dto';

@Injectable()
export class ClassroomsService {
  private readonly logger = new Logger(ClassroomsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(teacherId?: string) {
    const where: any = { deletedAt: null };
    if (teacherId) {
      where.teacherId = teacherId;
    }

    const classes = await this.prisma.classroom.findMany({
      where,
      include: {
        grade: true,
        teacher: true,
        classStudents: {
          where: { status: 'ACTIVE', student: { deletedAt: null } },
          include: {
            student: {
              include: {
                studentAttendances: {
                  take: 10,
                  orderBy: { createdAt: 'desc' },
                },
                studentAssessments: {
                  take: 5,
                },
                comments: {
                  take: 5,
                  orderBy: { commentDate: 'desc' },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return classes.map((cls) => this.mapClassroom(cls));
  }

  async findOne(id: string, teacherId?: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id },
      include: {
        grade: true,
        teacher: true,
        classStudents: {
          where: { status: 'ACTIVE', student: { deletedAt: null } },
          include: {
            student: {
              include: {
                studentAttendances: {
                  take: 10,
                  orderBy: { createdAt: 'desc' },
                },
                studentAssessments: {
                  take: 5,
                },
                comments: {
                  take: 5,
                  orderBy: { commentDate: 'desc' },
                },
              },
            },
          },
        },
      },
    });

    if (!classroom || classroom.deletedAt) {
      throw new NotFoundException(`Không tìm thấy lớp học với mã ${id}`);
    }

    if (teacherId && classroom.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập lớp học này');
    }

    return this.mapClassroom(classroom);
  }

  async create(dto: CreateClassroomDto, teacherId: string) {
    // Determine or create Grade
    let gradeId = dto.gradeId;
    if (!gradeId) {
      const gradeName = dto.gradeName || 'Khối 4';
      const level = parseInt(gradeName.replace(/\D/g, '')) || 4;
      let grade = await this.prisma.grade.findFirst({
        where: { level },
      });
      if (!grade) {
        grade = await this.prisma.grade.create({
          data: { name: gradeName, level },
        });
      }
      gradeId = grade.id;
    }

    // Determine SchoolYear
    let schoolYearId = dto.schoolYearId;
    if (!schoolYearId) {
      let currentYear = await this.prisma.schoolYear.findFirst({
        where: { isCurrent: true },
      });
      if (!currentYear) {
        currentYear = await this.prisma.schoolYear.create({
          data: {
            name: '2026 - 2027',
            startDate: new Date('2026-09-01'),
            endDate: new Date('2027-05-31'),
            isCurrent: true,
          },
        });
      }
      schoolYearId = currentYear.id;
    }

    const classroom = await this.prisma.classroom.create({
      data: {
        name: dto.name,
        gradeId,
        schoolYearId,
        teacherId,
        room: dto.room || 'Phòng mới',
        schedule: dto.schedule || 'Sáng · Thứ 2 - Thứ 6',
        accent: dto.accent || 'teal',
      },
      include: {
        grade: true,
        teacher: true,
        classStudents: {
          include: { student: true },
        },
      },
    });

    return this.mapClassroom(classroom);
  }

  async update(id: string, dto: UpdateClassroomDto, teacherId: string) {
    await this.findOne(id, teacherId);

    const updated = await this.prisma.classroom.update({
      where: { id },
      data: {
        name: dto.name,
        room: dto.room,
        schedule: dto.schedule,
        accent: dto.accent,
      },
      include: {
        grade: true,
        teacher: true,
        classStudents: {
          where: { status: 'ACTIVE', student: { deletedAt: null } },
          include: { student: true },
        },
      },
    });

    return this.mapClassroom(updated);
  }

  async remove(id: string, teacherId: string) {
    await this.findOne(id, teacherId);

    await this.prisma.classroom.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });

    return { success: true, message: 'Đã xóa lớp học' };
  }

  async getStudents(classId: string, teacherId: string) {
    const classroom = await this.findOne(classId, teacherId);
    return classroom.students;
  }

  async addStudent(classId: string, dto: AddStudentToClassDto, teacherId: string) {
    const classroom = await this.findOne(classId, teacherId);

    let studentId = dto.studentId;

    if (!studentId) {
      // Create student
      const initials = dto.fullName
        .trim()
        .split(' ')
        .map((p) => p[0])
        .slice(-2)
        .join('')
        .toUpperCase();

      const student = await this.prisma.student.create({
        data: {
          fullName: dto.fullName,
          initials,
          gender: dto.gender === 'Nữ' ? 'FEMALE' : 'MALE',
          dobString: dto.dob || 'Chưa cập nhật',
          parentName: dto.parentName || 'Chưa cập nhật',
          parentPhone: dto.parentPhone || 'Chưa cập nhật',
          status: 'GOOD',
          avatarColor: 'bg-teal-100 text-teal-700',
        },
      });
      studentId = student.id;

      if (dto.note) {
        await this.prisma.studentComment.create({
          data: {
            studentId: student.id,
            teacherId,
            classroomId: classId,
            content: dto.note,
          },
        });
      }
    }

    // Check if student already in class
    const existing = await this.prisma.classStudent.findUnique({
      where: {
        classroomId_studentId: {
          classroomId: classId,
          studentId,
        },
      },
    });

    if (existing) {
      if (existing.status !== 'ACTIVE') {
        await this.prisma.classStudent.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', leftAt: null },
        });
      } else {
        throw new ConflictException('Học sinh đã có trong lớp này');
      }
    } else {
      await this.prisma.classStudent.create({
        data: {
          classroomId: classId,
          studentId,
          status: 'ACTIVE',
        },
      });
    }

    return this.findOne(classId, teacherId);
  }

  async removeStudent(classId: string, studentId: string, teacherId: string) {
    await this.findOne(classId, teacherId);

    const classStudent = await this.prisma.classStudent.findUnique({
      where: {
        classroomId_studentId: {
          classroomId: classId,
          studentId,
        },
      },
    });

    if (!classStudent) {
      throw new NotFoundException('Học sinh không thuộc lớp học này');
    }

    await this.prisma.classStudent.update({
      where: { id: classStudent.id },
      data: { status: 'INACTIVE', leftAt: new Date() },
    });

    return { success: true, message: 'Đã xóa học sinh khỏi lớp' };
  }

  private mapClassroom(cls: any) {
    const activeClassStudents = cls.classStudents?.filter((cs: any) => cs.status === 'ACTIVE' && !cs.student?.deletedAt) || [];
    const students = activeClassStudents.map((cs: any) => {
      const s = cs.student;
      const latestComment = s.comments?.[0]?.content || 'Chưa có nhận xét.';
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

      return {
        id: s.id,
        name: s.fullName,
        initials: s.initials || s.fullName.slice(0, 2).toUpperCase(),
        gender: genderMap[s.gender] || 'Nam',
        dob: s.dobString || (s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString('vi-VN') : 'Chưa cập nhật'),
        guardian: s.parentName || 'Chưa cập nhật',
        phone: s.parentPhone || 'Chưa cập nhật',
        progress: s.status === 'EXCELLENT' ? 90 : s.status === 'GOOD' ? 80 : 70,
        status: statusMap[s.status] || 'Khá',
        attendance: 96,
        note: latestComment,
        color: s.avatarColor || 'bg-teal-100 text-teal-700',
      };
    });

    return {
      id: cls.id,
      name: cls.name,
      grade: cls.grade?.name || 'Khối 4',
      room: cls.room || 'Phòng học',
      schedule: cls.schedule || 'Sáng · Thứ 2 - Thứ 6',
      studentCount: students.length,
      average: 8.4,
      attendance: 96,
      teacher: cls.teacher?.fullName ? `Cô ${cls.teacher.fullName}` : 'Cô Nguyễn Hà',
      accent: cls.accent || 'teal',
      students,
    };
  }
}
