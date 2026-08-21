import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
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

  async findAll(options?: {
    teacherId?: string;
    schoolYearId?: string;
    gradeId?: string;
    isActive?: boolean;
    keyword?: string;
  }) {
    const where: any = { deletedAt: null };

    if (options?.teacherId) {
      where.teacherId = options.teacherId;
    }

    if (options?.schoolYearId) {
      where.schoolYearId = options.schoolYearId;
    }

    if (options?.gradeId) {
      where.gradeId = options.gradeId;
    }

    if (options?.isActive !== undefined) {
      where.isActive = options.isActive;
    }

    if (options?.keyword) {
      where.OR = [
        { name: { contains: options.keyword.trim(), mode: 'insensitive' } },
        { code: { contains: options.keyword.trim(), mode: 'insensitive' } },
        { room: { contains: options.keyword.trim(), mode: 'insensitive' } },
      ];
    }

    const classes = await this.prisma.classroom.findMany({
      where,
      include: {
        grade: true,
        schoolYear: true,
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
      orderBy: [{ grade: { sortOrder: 'asc' } }, { name: 'asc' }],
    });

    return classes.map((cls) => this.mapClassroom(cls));
  }

  async findOne(id: string, teacherId?: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id },
      include: {
        grade: true,
        schoolYear: true,
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

  async create(dto: CreateClassroomDto, currentTeacherId?: string) {
    // 1. Validate SchoolYear
    let schoolYearId = dto.schoolYearId;
    if (!schoolYearId) {
      const currentSy =
        (await this.prisma.schoolYear.findFirst({
          where: { isCurrent: true, isActive: true },
        })) ||
        (await this.prisma.schoolYear.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        }));
      schoolYearId = currentSy?.id;
    }

    if (!schoolYearId) {
      throw new BadRequestException('Vui lòng chọn năm học hoặc thiết lập năm học hoạt động');
    }

    const schoolYear = await this.prisma.schoolYear.findUnique({
      where: { id: schoolYearId },
    });

    if (!schoolYear) {
      throw new NotFoundException(`Không tìm thấy năm học với mã ${schoolYearId}`);
    }

    if (!schoolYear.isActive) {
      throw new BadRequestException(`Năm học "${schoolYear.name}" đang không ở trạng thái hoạt động`);
    }

    // 2. Validate Grade
    let gradeId = dto.gradeId;
    if (!gradeId) {
      const gradeNumMatch = dto.name.match(/\d+/);
      const gradeLevel = gradeNumMatch ? parseInt(gradeNumMatch[0], 10) : 4;
      const matchedGrade =
        (await this.prisma.grade.findFirst({
          where: { level: gradeLevel, isActive: true },
        })) ||
        (await this.prisma.grade.findFirst({
          where: { isActive: true },
          orderBy: { level: 'asc' },
        }));
      gradeId = matchedGrade?.id;
    }

    if (!gradeId) {
      throw new BadRequestException('Vui lòng chọn khối lớp');
    }

    const grade = await this.prisma.grade.findUnique({
      where: { id: gradeId },
    });

    if (!grade) {
      throw new NotFoundException(`Không tìm thấy khối lớp với mã ${gradeId}`);
    }

    if (!grade.isActive) {
      throw new BadRequestException(`Khối lớp "${grade.name}" đang không ở trạng thái hoạt động`);
    }

    // 3. Determine and validate Teacher
    const targetTeacherId = currentTeacherId || dto.homeroomTeacherId || dto.teacherId;
    if (!targetTeacherId) {
      throw new BadRequestException('Giáo viên chủ nhiệm không được để trống');
    }

    const teacher = await this.prisma.teacher.findUnique({
      where: { id: targetTeacherId },
    });

    if (!teacher) {
      throw new NotFoundException(`Không tìm thấy giáo viên với mã ${targetTeacherId}`);
    }

    // 4. Normalize Code
    const rawCode = dto.code || dto.name.replace(/^lớp\s+/i, '');
    const code = rawCode.trim().toUpperCase();

    if (!code) {
      throw new BadRequestException('Mã lớp học không hợp lệ');
    }

    // 5. Pre-check uniqueness
    const existing = await this.prisma.classroom.findFirst({
      where: {
        schoolYearId,
        code,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(`Mã lớp "${code}" đã tồn tại trong năm học "${schoolYear.name}"`);
    }

    try {
      const classroom = await this.prisma.classroom.create({
        data: {
          code,
          name: dto.name.trim(),
          gradeId,
          schoolYearId,
          teacherId: targetTeacherId,
          room: dto.room || 'Phòng học',
          schedule: dto.schedule || 'Sáng · Thứ 2 - Thứ 6',
          accent: dto.accent || 'teal',
          status: dto.status || 'ACTIVE',
          isActive: dto.isActive !== undefined ? dto.isActive : true,
        },
        include: {
          grade: true,
          schoolYear: true,
          teacher: true,
          classStudents: {
            include: { student: true },
          },
        },
      });

      return this.mapClassroom(classroom);
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException(`Mã lớp "${code}" đã tồn tại trong năm học này`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateClassroomDto, teacherId?: string) {
    const existing = await this.prisma.classroom.findUnique({
      where: { id },
      include: { schoolYear: true, grade: true },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Không tìm thấy lớp học với mã ${id}`);
    }

    if (teacherId && existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa lớp học này');
    }

    const schoolYearId = dto.schoolYearId || existing.schoolYearId;
    const gradeId = dto.gradeId || existing.gradeId;

    if (dto.schoolYearId && dto.schoolYearId !== existing.schoolYearId) {
      const sy = await this.prisma.schoolYear.findUnique({ where: { id: dto.schoolYearId } });
      if (!sy) throw new NotFoundException(`Không tìm thấy năm học với mã ${dto.schoolYearId}`);
      if (!sy.isActive) throw new BadRequestException(`Năm học "${sy.name}" đang không hoạt động`);
    }

    if (dto.gradeId && dto.gradeId !== existing.gradeId) {
      const g = await this.prisma.grade.findUnique({ where: { id: dto.gradeId } });
      if (!g) throw new NotFoundException(`Không tìm thấy khối lớp với mã ${dto.gradeId}`);
      if (!g.isActive) throw new BadRequestException(`Khối lớp "${g.name}" đang không hoạt động`);
    }

    const targetTeacherId = dto.homeroomTeacherId || dto.teacherId;
    if (targetTeacherId && targetTeacherId !== existing.teacherId) {
      const t = await this.prisma.teacher.findUnique({ where: { id: targetTeacherId } });
      if (!t) throw new NotFoundException(`Không tìm thấy giáo viên với mã ${targetTeacherId}`);
    }

    let code = existing.code;
    if (dto.code) {
      code = dto.code.trim().toUpperCase();
    } else if (dto.name && !existing.code) {
      code = dto.name.replace(/^lớp\s+/i, '').trim().toUpperCase();
    }

    if ((dto.code && dto.code.trim().toUpperCase() !== existing.code) || (dto.schoolYearId && dto.schoolYearId !== existing.schoolYearId)) {
      const duplicate = await this.prisma.classroom.findFirst({
        where: {
          schoolYearId,
          code,
          deletedAt: null,
          NOT: { id },
        },
      });

      if (duplicate) {
        throw new ConflictException(`Mã lớp "${code}" đã tồn tại trong năm học này`);
      }
    }

    try {
      const updated = await this.prisma.classroom.update({
        where: { id },
        data: {
          code: dto.code ? code : undefined,
          name: dto.name ? dto.name.trim() : undefined,
          gradeId: dto.gradeId,
          schoolYearId: dto.schoolYearId,
          teacherId: targetTeacherId || undefined,
          room: dto.room,
          schedule: dto.schedule,
          accent: dto.accent,
          status: dto.status,
          isActive: dto.isActive,
        },
        include: {
          grade: true,
          schoolYear: true,
          teacher: true,
          classStudents: {
            where: { status: 'ACTIVE', student: { deletedAt: null } },
            include: { student: true },
          },
        },
      });

      return this.mapClassroom(updated);
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException(`Mã lớp "${code}" đã tồn tại trong năm học này`);
      }
      throw err;
    }
  }

  async remove(id: string, teacherId?: string) {
    await this.findOne(id, teacherId);

    await this.prisma.classroom.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE', isActive: false },
    });

    return { success: true, message: 'Đã vô hiệu hóa lớp học thành công' };
  }

  async getStudents(classId: string, teacherId?: string) {
    const classroom = await this.findOne(classId, teacherId);
    return classroom.students;
  }

  async addStudent(classId: string, dto: AddStudentToClassDto, teacherId?: string) {
    await this.findOne(classId, teacherId);

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
          fullName: dto.fullName.trim(),
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

      if (dto.note && teacherId) {
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

    // Check and update StudentEnrollment
    const classroomData = await this.prisma.classroom.findUnique({
      where: { id: classId },
    });
    if (classroomData) {
      const existingEnrollment = await this.prisma.studentEnrollment.findFirst({
        where: {
          studentId,
          schoolYearId: classroomData.schoolYearId,
          status: 'ACTIVE',
        },
      });

      if (existingEnrollment && existingEnrollment.classroomId !== classId) {
        throw new ConflictException('Học sinh đang theo học ở một lớp khác trong năm học này');
      }

      if (!existingEnrollment) {
        await this.prisma.studentEnrollment.create({
          data: {
            studentId,
            schoolYearId: classroomData.schoolYearId,
            classroomId: classId,
            status: 'ACTIVE',
            enrolledAt: new Date(),
          },
        });
      }
    }

    // Check if student already in class (ClassStudent sync)
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

  async removeStudent(classId: string, studentId: string, teacherId?: string) {
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

    const activeEnrollment = await this.prisma.studentEnrollment.findFirst({
      where: {
        studentId,
        classroomId: classId,
        status: 'ACTIVE',
      },
    });

    if (activeEnrollment) {
      await this.prisma.studentEnrollment.update({
        where: { id: activeEnrollment.id },
        data: { status: 'TRANSFERRED', leftAt: new Date() },
      });
    }

    return { success: true, message: 'Đã xóa học sinh khỏi lớp' };
  }

  private mapClassroom(cls: any) {
    const activeClassStudents =
      cls.classStudents?.filter((cs: any) => cs.status === 'ACTIVE' && !cs.student?.deletedAt) || [];
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
      code: cls.code || cls.name,
      name: cls.name,
      gradeId: cls.gradeId,
      grade: cls.grade?.name || 'Khối 4',
      gradeDetail: cls.grade
        ? {
            id: cls.grade.id,
            code: cls.grade.code,
            name: cls.grade.name,
            level: cls.grade.level,
          }
        : undefined,
      schoolYearId: cls.schoolYearId,
      schoolYear: cls.schoolYear
        ? {
            id: cls.schoolYear.id,
            name: cls.schoolYear.name,
            isCurrent: cls.schoolYear.isCurrent,
          }
        : undefined,
      homeroomTeacherId: cls.teacherId,
      homeroomTeacher: cls.teacher
        ? {
            id: cls.teacher.id,
            fullName: cls.teacher.fullName,
            phone: cls.teacher.phone,
          }
        : undefined,
      room: cls.room || 'Phòng học',
      schedule: cls.schedule || 'Sáng · Thứ 2 - Thứ 6',
      studentCount: students.length,
      average: 8.4,
      attendance: 96,
      teacher: cls.teacher?.fullName ? `Cô ${cls.teacher.fullName}` : 'Cô Nguyễn Thị Mai',
      accent: cls.accent || 'teal',
      status: cls.status,
      isActive: cls.isActive !== undefined ? cls.isActive : true,
      students,
    };
  }
}
