import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';
import { CreateClassroomDto } from './dto/create-classroom.dto';
import { UpdateClassroomDto } from './dto/update-classroom.dto';
import { AddStudentToClassDto } from './dto/add-student-to-class.dto';
import { CloneClassroomDto } from './dto/clone-classroom.dto';
import { ImportStudentsDto } from './dto/import-students.dto';
import { TransferStudentDto } from './dto/transfer-student.dto';

@Injectable()
export class ClassroomsService {
  private readonly logger = new Logger(ClassroomsService.name);

  constructor(
    private prisma: PrismaService,
    private assignmentAuth: TeachingAssignmentAuthorizationService,
    @Optional() private auditService?: AuditService,
  ) {}

  /**
   * Helper to verify teacher authorization on classroom
   */
  async assertTeacherAccess(classroomId: string, teacherId?: string, requireHomeroom = false) {
    return this.assignmentAuth.assertTeacherCanAccessClassroom(
      classroomId,
      teacherId,
      requireHomeroom,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASSROOM LIST & OVERVIEW
  // ═══════════════════════════════════════════════════════════════════════════

  async findAll(options?: {
    teacherId?: string;
    schoolYearId?: string;
    gradeId?: string;
    status?: string;
    isActive?: boolean;
    keyword?: string;
    sort?: string;
  }) {
    const where: any = { deletedAt: null };

    // Anti-IDOR / Scope filter
    if (options?.teacherId) {
      where.OR = [
        { teacherId: options.teacherId },
        { teachingAssignments: { some: { teacherId: options.teacherId, isActive: true } } },
      ];
    }

    if (options?.schoolYearId && options.schoolYearId !== 'ALL') {
      where.schoolYearId = options.schoolYearId;
    }

    if (options?.gradeId && options.gradeId !== 'ALL') {
      where.gradeId = options.gradeId;
    }

    if (options?.status && options.status !== 'ALL') {
      where.status = options.status;
    }

    if (options?.isActive !== undefined) {
      where.isActive = options.isActive;
    }

    if (options?.keyword) {
      const kw = options.keyword.trim();
      const searchCondition = [
        { name: { contains: kw, mode: 'insensitive' } },
        { code: { contains: kw, mode: 'insensitive' } },
        { room: { contains: kw, mode: 'insensitive' } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchCondition }];
        delete where.OR;
      } else {
        where.OR = searchCondition;
      }
    }

    let orderBy: any = [{ grade: { sortOrder: 'asc' } }, { name: 'asc' }];
    if (options?.sort === 'updatedAt') {
      orderBy = [{ updatedAt: 'desc' }];
    } else if (options?.sort === 'name') {
      orderBy = [{ name: 'asc' }];
    }

    const classes = await this.prisma.classroom.findMany({
      where,
      include: {
        grade: true,
        schoolYear: true,
        teacher: true,
        studentEnrollments: {
          where: { status: 'ACTIVE', student: { deletedAt: null } },
          include: {
            student: {
              include: {
                studentAttendances: { take: 10, orderBy: { createdAt: 'desc' } },
              },
            },
          },
        },
        classStudents: {
          where: { status: 'ACTIVE', student: { deletedAt: null } },
          include: { student: true },
        },
        attendanceSessions: {
          take: 30,
          orderBy: { attendanceDate: 'desc' },
          include: {
            attendances: true,
          },
        },
        assessments: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            studentAssessments: true,
          },
        },
        schedules: {
          where: { deletedAt: null },
          take: 10,
          orderBy: { plannedDate: 'desc' },
        },
      },
      orderBy,
    });

    const mappedClasses = classes.map((cls) => this.mapClassroom(cls));

    const totalClasses = mappedClasses.length;
    const allUniqueStudentIds = new Set<string>();
    let totalAttendanceWeighted = 0;
    let attendanceCount = 0;

    for (const cls of mappedClasses) {
      cls.students.forEach((s: any) => allUniqueStudentIds.add(s.id));
      if (typeof cls.attendance === 'number' && cls.attendance !== null) {
        totalAttendanceWeighted += cls.attendance;
        attendanceCount++;
      }
    }

    const totalStudents = allUniqueStudentIds.size;
    const avgAttendanceRate = attendanceCount > 0
      ? Math.round(totalAttendanceWeighted / attendanceCount)
      : null;

    if (options?.sort === 'studentCount') {
      mappedClasses.sort((a, b) => b.studentCount - a.studentCount);
    } else if (options?.sort === 'attendanceRate') {
      mappedClasses.sort((a, b) => {
        const aVal = a.attendance !== null && a.attendance !== undefined ? a.attendance : -1;
        const bVal = b.attendance !== null && b.attendance !== undefined ? b.attendance : -1;
        return bVal - aVal;
      });
    }

    return {
      items: mappedClasses,
      summary: {
        totalClasses,
        totalStudents,
        avgAttendanceRate,
      },
    };
  }

  async findOne(id: string, teacherId?: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id },
      include: {
        grade: true,
        schoolYear: true,
        teacher: true,
        studentEnrollments: {
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
        classStudents: {
          where: { status: 'ACTIVE', student: { deletedAt: null } },
          include: { student: true },
        },
        attendanceSessions: {
          take: 30,
          orderBy: { attendanceDate: 'desc' },
          include: { attendances: true },
        },
        assessments: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: { studentAssessments: true },
        },
        teachingAssignments: {
          where: { isActive: true },
          include: { subject: true, teacher: true },
        },
        schedules: {
          where: { deletedAt: null },
          take: 10,
          orderBy: { plannedDate: 'desc' },
          include: { subject: true },
        },
      },
    });

    if (!classroom || classroom.deletedAt) {
      throw new NotFoundException(`Không tìm thấy lớp học với mã ${id}`);
    }

    if (teacherId) {
      const isHomeroom = classroom.teacherId === teacherId;
      const hasAssignment = (classroom.teachingAssignments || []).some(
        (ta: any) => ta.teacherId === teacherId && ta.isActive !== false,
      );
      if (!isHomeroom && !hasAssignment) {
        throw new ForbiddenException('Bạn không có quyền truy cập lớp học này');
      }
    }

    return this.mapClassroom(classroom);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASSROOM CRUD OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async create(dto: CreateClassroomDto, currentTeacherId?: string) {
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

    const rawCode = dto.code || dto.name.replace(/^lớp\s+/i, '');
    const code = rawCode.trim().toUpperCase();

    if (!code) {
      throw new BadRequestException('Mã lớp học không hợp lệ');
    }

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
          studentEnrollments: {
            include: { student: true },
          },
        },
      });

      this.auditService?.log({
        action: 'CLASSROOM_CREATE',
        resourceType: 'Classroom',
        resourceId: classroom.id,
        details: { name: classroom.name, code: classroom.code, schoolYearId, gradeId },
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
          studentEnrollments: {
            where: { status: 'ACTIVE', student: { deletedAt: null } },
            include: {
              student: {
                include: {
                  studentAttendances: { take: 10, orderBy: { createdAt: 'desc' } },
                },
              },
            },
          },
        },
      });

      this.auditService?.log({
        action: 'CLASSROOM_UPDATE',
        resourceType: 'Classroom',
        resourceId: id,
        details: { changes: dto },
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
    const existing = await this.prisma.classroom.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Không tìm thấy lớp học với mã ${id}`);
    }

    if (teacherId && existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền xóa lớp học này');
    }

    await this.prisma.classroom.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE', isActive: false },
    });

    this.auditService?.log({
      action: 'CLASSROOM_ARCHIVE',
      resourceType: 'Classroom',
      resourceId: id,
    });

    return { success: true, message: 'Đã lưu trữ và ngừng sử dụng lớp học thành công' };
  }

  async completeClass(id: string, teacherId?: string) {
    await this.assertTeacherAccess(id, teacherId, true);

    const updated = await this.prisma.classroom.update({
      where: { id },
      data: { status: 'COMPLETED', isActive: false },
      include: { grade: true, schoolYear: true, teacher: true },
    });

    this.auditService?.log({
      action: 'CLASSROOM_COMPLETE',
      resourceType: 'Classroom',
      resourceId: id,
    });

    return this.mapClassroom(updated);
  }

  async cloneClass(id: string, dto: CloneClassroomDto, teacherId?: string) {
    const sourceClass = await this.assertTeacherAccess(id, teacherId, true);

    const targetSy = await this.prisma.schoolYear.findUnique({
      where: { id: dto.targetSchoolYearId },
    });
    if (!targetSy || !targetSy.isActive) {
      throw new BadRequestException('Năm học đích không tồn tại hoặc không hoạt động');
    }

    const targetGradeId = dto.targetGradeId || sourceClass.gradeId;
    const targetCode = (dto.targetCode || dto.targetName.replace(/^lớp\s+/i, '')).trim().toUpperCase();

    const existing = await this.prisma.classroom.findFirst({
      where: {
        schoolYearId: dto.targetSchoolYearId,
        code: targetCode,
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictException(`Mã lớp "${targetCode}" đã tồn tại trong năm học đích`);
    }

    return await this.prisma.$transaction(async (tx) => {
      const newClass = await tx.classroom.create({
        data: {
          name: dto.targetName.trim(),
          code: targetCode,
          gradeId: targetGradeId,
          schoolYearId: dto.targetSchoolYearId,
          teacherId: sourceClass.teacherId,
          room: sourceClass.room,
          schedule: sourceClass.schedule,
          accent: sourceClass.accent,
          status: 'ACTIVE',
          isActive: true,
        },
        include: { grade: true, schoolYear: true, teacher: true },
      });

      if (dto.copyStudents) {
        const activeEnrollments = await tx.studentEnrollment.findMany({
          where: { classroomId: id, status: 'ACTIVE', student: { deletedAt: null } },
        });

        for (const en of activeEnrollments) {
          await tx.studentEnrollment.create({
            data: {
              studentId: en.studentId,
              schoolYearId: dto.targetSchoolYearId,
              classroomId: newClass.id,
              status: 'ACTIVE',
              enrolledAt: new Date(),
            },
          });

          await tx.classStudent.create({
            data: {
              classroomId: newClass.id,
              studentId: en.studentId,
              status: 'ACTIVE',
            },
          });
        }
      }

      this.auditService?.log({
        action: 'CLASSROOM_CLONE',
        resourceType: 'Classroom',
        resourceId: newClass.id,
        details: { sourceClassroomId: id, targetSchoolYearId: dto.targetSchoolYearId, copyStudents: dto.copyStudents },
      });

      return this.mapClassroom(newClass);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASSROOM DASHBOARD / KPI (TAB TỔNG QUAN)
  // ═══════════════════════════════════════════════════════════════════════════

  async getDashboard(id: string, teacherId?: string) {
    await this.assertTeacherAccess(id, teacherId);

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const [
      classroom,
      activeEnrollments,
      recentSchedules,
      weeklyScheduleCount,
      preparedLessonPlans,
      recentAttendanceSessions,
      recentAssessments,
    ] = await Promise.all([
      this.prisma.classroom.findUnique({
        where: { id },
        include: { grade: true, schoolYear: true, teacher: true },
      }),
      this.prisma.studentEnrollment.findMany({
        where: { classroomId: id, status: 'ACTIVE', student: { deletedAt: null } },
        include: {
          student: {
            include: {
              studentAssessments: { take: 5, orderBy: { createdAt: 'desc' } },
              studentAttendances: { take: 10, orderBy: { createdAt: 'desc' } },
            },
          },
        },
      }),
      this.prisma.schedule.findMany({
        where: { classroomId: id, deletedAt: null },
        take: 5,
        orderBy: { plannedDate: 'desc' },
        include: { subject: true, teacher: true },
      }),
      this.prisma.schedule.count({
        where: {
          classroomId: id,
          deletedAt: null,
          plannedDate: { gte: startOfWeek, lte: endOfWeek },
        },
      }),
      this.prisma.lessonPlan.count({
        where: {
          classroomId: id,
          deletedAt: null,
          status: { in: ['COMPLETED', 'TAUGHT'] },
        },
      }),
      this.prisma.attendanceSession.findMany({
        where: { classroomId: id },
        take: 5,
        orderBy: { attendanceDate: 'desc' },
        include: {
          schedule: { include: { subject: true } },
          attendances: {
            where: { status: { in: ['EXCUSED_ABSENCE', 'UNEXCUSED_ABSENCE', 'LATE'] } },
            include: { student: true },
          },
        },
      }),
      this.prisma.assessment.findMany({
        where: { classroomId: id },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { subject: true, studentAssessments: true },
      }),
    ]);

    if (!classroom || classroom.deletedAt) {
      throw new NotFoundException(`Không tìm thấy lớp học với mã ${id}`);
    }

    const recentAbsences: any[] = [];
    const recentLates: any[] = [];
    recentAttendanceSessions.forEach((sess) => {
      sess.attendances.forEach((sa) => {
        const item = {
          studentId: sa.studentId,
          studentName: sa.student?.fullName || 'Học sinh',
          date: sess.attendanceDate.toISOString().split('T')[0],
          subjectName: sess.schedule?.subject?.name || 'Môn học',
          note: sa.note || '',
        };
        if (sa.status === 'LATE') {
          recentLates.push({ ...item, lateMinutes: sa.lateMinutes || 5 });
        } else {
          recentAbsences.push({ ...item, type: sa.status === 'EXCUSED_ABSENCE' ? 'Có phép' : 'Không phép' });
        }
      });
    });

    const studentCount = activeEnrollments.length;
    const needsSupportStudentCount = activeEnrollments.filter(
      (e) => e.student.status === 'NEEDS_SUPPORT',
    ).length;

    const mapped = this.mapClassroom(classroom);

    return {
      classroomId: id,
      className: classroom.name,
      grade: classroom.grade?.name,
      schoolYear: classroom.schoolYear?.name,
      room: classroom.room,
      kpis: {
        studentCount,
        attendanceRate: mapped.attendance,
        averageScore: mapped.average,
        weeklyScheduleCount,
        preparedLessonPlanCount: preparedLessonPlans,
        needsSupportStudentCount,
      },
      recentSchedules: recentSchedules.map((s) => ({
        id: s.id,
        plannedDate: s.plannedDate.toISOString().split('T')[0],
        startTime: s.startTime,
        endTime: s.endTime,
        subjectName: s.subject?.name || 'Môn học',
        teacherName: s.teacher?.fullName || 'Giáo viên',
        room: s.room || classroom.room,
        status: s.status,
      })),
      recentAbsences: recentAbsences.slice(0, 5),
      recentLates: recentLates.slice(0, 5),
      recentAssessments: recentAssessments.map((a) => {
        let avg: number | null = null;
        if (a.studentAssessments.length > 0) {
          const sum = a.studentAssessments.reduce((acc, curr) => acc + (curr.score || 0), 0);
          avg = parseFloat((sum / a.studentAssessments.length).toFixed(1));
        }
        return {
          id: a.id,
          name: a.title,
          subjectName: a.subject?.name || 'Môn học',
          score: avg,
          date: a.assessmentDate.toISOString().split('T')[0],
        };
      }),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STUDENT ENROLLMENT & MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  async getStudents(classId: string, teacherId?: string) {
    await this.assertTeacherAccess(classId, teacherId);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { classroomId: classId, status: 'ACTIVE', student: { deletedAt: null } },
      include: {
        student: {
          include: {
            studentAttendances: { take: 10, orderBy: { createdAt: 'desc' } },
            studentAssessments: { take: 5, orderBy: { createdAt: 'desc' } },
            comments: { where: { classroomId: classId }, take: 3, orderBy: { commentDate: 'desc' } },
          },
        },
      },
      orderBy: { student: { fullName: 'asc' } },
    });

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

    return enrollments.map((en, idx) => {
      const s = en.student;
      const latestComment = s.comments?.[0]?.content || 'Chưa có nhận xét.';
      let studentAtt: number | null = null;
      if (s.studentAttendances && s.studentAttendances.length > 0) {
        const pres = s.studentAttendances.filter((a: any) => a.status === 'PRESENT' || a.status === 'LATE').length;
        studentAtt = Math.round((pres / s.studentAttendances.length) * 100);
      }

      return {
        id: s.id,
        stt: idx + 1,
        studentCode: s.studentCode || '',
        name: s.fullName,
        fullName: s.fullName,
        initials: s.initials || s.fullName.slice(0, 2).toUpperCase(),
        gender: genderMap[s.gender] || 'Nam',
        dob: s.dobString || (s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString('vi-VN') : 'Chưa cập nhật'),
        guardian: s.parentName || 'Chưa cập nhật',
        parentName: s.parentName || 'Chưa cập nhật',
        phone: s.parentPhone || 'Chưa cập nhật',
        parentPhone: s.parentPhone || 'Chưa cập nhật',
        progress: s.status === 'EXCELLENT' ? 90 : s.status === 'GOOD' ? 80 : 70,
        status: statusMap[s.status] || 'Khá',
        attendance: studentAtt,
        note: latestComment,
        color: s.avatarColor || 'bg-teal-100 text-teal-700',
        enrollmentId: en.id,
        enrolledAt: en.enrolledAt,
      };
    });
  }

  async addStudent(classId: string, dto: AddStudentToClassDto, teacherId?: string) {
    const classroom = await this.assertTeacherAccess(classId, teacherId);

    return await this.prisma.$transaction(async (tx) => {
      let studentId = dto.studentId;

      if (!studentId) {
        const initials = dto.fullName
          .trim()
          .split(' ')
          .map((p) => p[0])
          .slice(-2)
          .join('')
          .toUpperCase();

        const student = await tx.student.create({
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

      const existingEnrollment = await tx.studentEnrollment.findFirst({
        where: {
          studentId,
          schoolYearId: classroom.schoolYearId,
          status: 'ACTIVE',
        },
      });

      if (existingEnrollment && existingEnrollment.classroomId !== classId) {
        throw new ConflictException('Học sinh đang theo học ở một lớp khác trong năm học này');
      }

      if (!existingEnrollment) {
        await tx.studentEnrollment.create({
          data: {
            studentId,
            schoolYearId: classroom.schoolYearId,
            classroomId: classId,
            status: 'ACTIVE',
            enrolledAt: new Date(),
          },
        });
      }

      await tx.classStudent.upsert({
        where: {
          classroomId_studentId: {
            classroomId: classId,
            studentId,
          },
        },
        update: { status: 'ACTIVE', leftAt: null },
        create: {
          classroomId: classId,
          studentId,
          status: 'ACTIVE',
        },
      });

      this.auditService?.log({
        action: 'STUDENT_ENROLL',
        resourceType: 'Classroom',
        resourceId: classId,
        details: { studentId, fullName: dto.fullName },
      });

      return this.findOne(classId, teacherId);
    });
  }

  async importStudents(classId: string, dto: ImportStudentsDto, teacherId?: string) {
    const classroom = await this.assertTeacherAccess(classId, teacherId);

    if (!dto.students || dto.students.length === 0) {
      throw new BadRequestException('Danh sách học sinh import không được rỗng');
    }

    const errors: string[] = [];
    let importedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < dto.students.length; i++) {
        const item = dto.students[i];
        if (!item.fullName || !item.fullName.trim()) {
          errors.push(`Dòng ${i + 1}: Thiếu họ và tên học sinh`);
          continue;
        }

        try {
          const initials = item.fullName
            .trim()
            .split(' ')
            .map((p) => p[0])
            .slice(-2)
            .join('')
            .toUpperCase();

          let student: any;
          if (item.studentCode && item.studentCode.trim()) {
            student = await tx.student.findUnique({
              where: { studentCode: item.studentCode.trim() },
            });
          }

          if (!student) {
            student = await tx.student.create({
              data: {
                studentCode: item.studentCode?.trim() || undefined,
                fullName: item.fullName.trim(),
                initials,
                gender: item.gender === 'Nữ' || item.gender === 'FEMALE' ? 'FEMALE' : 'MALE',
                dobString: item.dob || 'Chưa cập nhật',
                parentName: item.parentName || 'Chưa cập nhật',
                parentPhone: item.parentPhone || 'Chưa cập nhật',
                status: 'GOOD',
                avatarColor: 'bg-teal-100 text-teal-700',
              },
            });
          }

          const existingEnrollment = await tx.studentEnrollment.findFirst({
            where: {
              studentId: student.id,
              schoolYearId: classroom.schoolYearId,
              status: 'ACTIVE',
            },
          });

          if (!existingEnrollment) {
            await tx.studentEnrollment.create({
              data: {
                studentId: student.id,
                schoolYearId: classroom.schoolYearId,
                classroomId: classId,
                status: 'ACTIVE',
                enrolledAt: new Date(),
              },
            });
          }

          await tx.classStudent.upsert({
            where: {
              classroomId_studentId: {
                classroomId: classId,
                studentId: student.id,
              },
            },
            update: { status: 'ACTIVE', leftAt: null },
            create: {
              classroomId: classId,
              studentId: student.id,
              status: 'ACTIVE',
            },
          });

          if (item.note && teacherId) {
            await tx.studentComment.create({
              data: {
                studentId: student.id,
                teacherId,
                classroomId: classId,
                content: item.note,
              },
            });
          }

          importedCount++;
        } catch (rowErr: any) {
          errors.push(`Dòng ${i + 1} (${item.fullName}): ${rowErr.message || 'Lỗi không xác định'}`);
        }
      }
    });

    this.auditService?.log({
      action: 'STUDENT_IMPORT',
      resourceType: 'Classroom',
      resourceId: classId,
      details: { totalAttempted: dto.students.length, importedCount, errorsCount: errors.length },
    });

    return {
      success: true,
      importedCount,
      errors,
      message: `Đã import thành công ${importedCount}/${dto.students.length} học sinh`,
    };
  }

  async transferStudent(classId: string, studentId: string, dto: TransferStudentDto, teacherId?: string) {
    await this.assertTeacherAccess(classId, teacherId);
    await this.assertTeacherAccess(dto.targetClassroomId, teacherId);

    return await this.prisma.$transaction(async (tx) => {
      const activeEnrollment = await tx.studentEnrollment.findFirst({
        where: {
          studentId,
          classroomId: classId,
          status: 'ACTIVE',
        },
      });

      if (!activeEnrollment) {
        throw new NotFoundException('Học sinh không có ghi danh đang hoạt động tại lớp này');
      }

      const targetClass = await tx.classroom.findUnique({
        where: { id: dto.targetClassroomId },
      });

      if (!targetClass || targetClass.deletedAt) {
        throw new NotFoundException('Lớp học đích không tồn tại hoặc đã bị xóa');
      }

      const now = dto.transferDate ? new Date(dto.transferDate) : new Date();

      await tx.studentEnrollment.update({
        where: { id: activeEnrollment.id },
        data: {
          status: 'TRANSFERRED',
          leftAt: now,
          transferReason: dto.reason || 'Chuyển lớp',
        },
      });

      await tx.classStudent.updateMany({
        where: { classroomId: classId, studentId },
        data: { status: 'INACTIVE', leftAt: now },
      });

      await tx.studentEnrollment.create({
        data: {
          studentId,
          schoolYearId: targetClass.schoolYearId,
          classroomId: dto.targetClassroomId,
          status: 'ACTIVE',
          enrolledAt: now,
        },
      });

      await tx.classStudent.upsert({
        where: {
          classroomId_studentId: {
            classroomId: dto.targetClassroomId,
            studentId,
          },
        },
        update: { status: 'ACTIVE', leftAt: null },
        create: {
          classroomId: dto.targetClassroomId,
          studentId,
          status: 'ACTIVE',
        },
      });

      this.auditService?.log({
        action: 'STUDENT_TRANSFER',
        resourceType: 'Classroom',
        resourceId: classId,
        details: { studentId, targetClassroomId: dto.targetClassroomId, reason: dto.reason },
      });

      return { success: true, message: `Đã chuyển học sinh sang lớp ${targetClass.name} thành công` };
    });
  }

  async removeStudent(classId: string, studentId: string, teacherId?: string) {
    await this.assertTeacherAccess(classId, teacherId);

    return await this.prisma.$transaction(async (tx) => {
      const activeEnrollment = await tx.studentEnrollment.findFirst({
        where: {
          studentId,
          classroomId: classId,
          status: 'ACTIVE',
        },
      });

      if (activeEnrollment) {
        await tx.studentEnrollment.update({
          where: { id: activeEnrollment.id },
          data: { status: 'WITHDRAWN', leftAt: new Date() },
        });
      }

      await tx.classStudent.updateMany({
        where: { classroomId: classId, studentId },
        data: { status: 'INACTIVE', leftAt: new Date() },
      });

      this.auditService?.log({
        action: 'STUDENT_REMOVE',
        resourceType: 'Classroom',
        resourceId: classId,
        details: { studentId },
      });

      return { success: true, message: 'Đã rút học sinh khỏi lớp thành công' };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTEGRATED TABS: SCHEDULES, ATTENDANCE, ASSESSMENTS, LESSON PLANS
  // ═══════════════════════════════════════════════════════════════════════════

  async getClassSchedules(classId: string, teacherId?: string) {
    await this.assertTeacherAccess(classId, teacherId);

    const schedules = await this.prisma.schedule.findMany({
      where: { classroomId: classId, deletedAt: null },
      orderBy: { plannedDate: 'desc' },
      include: {
        subject: true,
        teacher: true,
        lessonPlan: { select: { id: true, title: true, status: true } },
      },
    });

    const scheduleIds = schedules.map((s) => s.id);
    const sessions = await this.prisma.attendanceSession.findMany({
      where: { scheduleId: { in: scheduleIds } },
      select: { scheduleId: true, id: true },
    });
    const recordedMap = new Set(sessions.map((s) => s.scheduleId));

    return schedules.map((s) => ({
      id: s.id,
      plannedDate: s.plannedDate.toISOString().split('T')[0],
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room,
      status: s.status,
      subject: s.subject ? { id: s.subject.id, name: s.subject.name, code: s.subject.code } : undefined,
      teacher: s.teacher ? { id: s.teacher.id, fullName: s.teacher.fullName } : undefined,
      lessonPlan: s.lessonPlan ? { id: s.lessonPlan.id, title: s.lessonPlan.title, status: s.lessonPlan.status } : undefined,
      isAttendanceRecorded: recordedMap.has(s.id),
    }));
  }

  async getClassAttendance(classId: string, options?: { range?: string }, teacherId?: string) {
    await this.assertTeacherAccess(classId, teacherId);

    const now = new Date();
    let dateFilter: any = undefined;

    if (options?.range === 'today') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      dateFilter = { gte: startOfDay, lte: endOfDay };
    } else if (options?.range === 'week') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + 1);
      startOfWeek.setHours(0, 0, 0, 0);
      dateFilter = { gte: startOfWeek };
    } else if (options?.range === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      dateFilter = { gte: startOfMonth };
    }

    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        classroomId: classId,
        attendanceDate: dateFilter,
      },
      orderBy: { attendanceDate: 'desc' },
      include: {
        teacher: true,
        schedule: { include: { subject: true } },
        attendances: {
          include: { student: true },
        },
      },
    });

    let totalRecorded = 0;
    let presentCount = 0;
    let excusedCount = 0;
    let unexcusedCount = 0;
    let lateCount = 0;

    const sessionList = sessions.map((sess) => {
      let sPresent = 0;
      let sExcused = 0;
      let sUnexcused = 0;
      let sLate = 0;

      sess.attendances.forEach((sa) => {
        totalRecorded++;
        if (sa.status === 'PRESENT') {
          presentCount++;
          sPresent++;
        } else if (sa.status === 'EXCUSED_ABSENCE') {
          excusedCount++;
          sExcused++;
        } else if (sa.status === 'UNEXCUSED_ABSENCE') {
          unexcusedCount++;
          sUnexcused++;
        } else if (sa.status === 'LATE') {
          lateCount++;
          sLate++;
        }
      });

      return {
        id: sess.id,
        scheduleId: sess.scheduleId,
        date: sess.attendanceDate.toISOString().split('T')[0],
        subjectName: sess.schedule?.subject?.name || 'Môn học',
        teacherName: sess.teacher?.fullName || 'Giáo viên',
        stats: {
          present: sPresent,
          excused: sExcused,
          unexcused: sUnexcused,
          late: sLate,
          total: sess.attendances.length,
        },
      };
    });

    const absentTotal = excusedCount + unexcusedCount;
    const attendanceRate = totalRecorded > 0
      ? Math.round(((presentCount + lateCount) / totalRecorded) * 100)
      : null;

    return {
      summary: {
        attendanceRate,
        presentCount,
        absentCount: absentTotal,
        excusedCount,
        unexcusedCount,
        lateCount,
        totalSessions: sessions.length,
      },
      sessions: sessionList,
    };
  }

  async getClassAssessments(classId: string, teacherId?: string) {
    await this.assertTeacherAccess(classId, teacherId);

    const assessments = await this.prisma.assessment.findMany({
      where: { classroomId: classId },
      orderBy: { createdAt: 'desc' },
      include: {
        subject: true,
        teacher: true,
        studentAssessments: {
          include: { student: true },
        },
      },
    });

    let totalScore = 0;
    let scoreCount = 0;
    let excellentCount = 0;
    let completedCount = 0;
    let needsSupportCount = 0;

    assessments.forEach((a) => {
      a.studentAssessments.forEach((sa) => {
        if (typeof sa.score === 'number') {
          totalScore += sa.score;
          scoreCount++;
        }
        if (sa.level === 'EXCELLENT') excellentCount++;
        else if (sa.level === 'COMPLETED') completedCount++;
        else if (sa.level === 'NEEDS_SUPPORT') needsSupportCount++;
      });
    });

    const avgScore = scoreCount > 0 ? parseFloat((totalScore / scoreCount).toFixed(1)) : null;

    return {
      summary: {
        avgScore,
        excellentCount,
        completedCount,
        needsSupportCount,
        totalAssessments: assessments.length,
      },
      assessments: assessments.map((a) => {
        let avg: number | null = null;
        if (a.studentAssessments.length > 0) {
          const sum = a.studentAssessments.reduce((acc, curr) => acc + (curr.score || 0), 0);
          avg = parseFloat((sum / a.studentAssessments.length).toFixed(1));
        }
        return {
          id: a.id,
          name: a.title,
          date: a.assessmentDate.toISOString().split('T')[0],
          subjectName: a.subject?.name || 'Môn học',
          teacherName: a.teacher?.fullName || 'Giáo viên',
          studentCount: a.studentAssessments.length,
          averageScore: avg,
        };
      }),
    };
  }

  async getClassLessonPlans(classId: string, teacherId?: string) {
    await this.assertTeacherAccess(classId, teacherId);

    const lessonPlans = await this.prisma.lessonPlan.findMany({
      where: {
        classroomId: classId,
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        subject: true,
        teacher: true,
      },
    });

    return lessonPlans.map((lp) => ({
      id: lp.id,
      title: lp.title,
      subjectName: lp.subject?.name || 'Môn học',
      status: lp.status,
      teachingDate: lp.teachingDate ? lp.teachingDate.toISOString().split('T')[0] : null,
      teacherName: lp.teacher?.fullName || 'Giáo viên',
      fileUrl: lp.storagePath || null,
      sourceType: lp.sourceType === 'UPLOADED' ? (lp.mimeType?.includes('pdf') ? 'PDF' : 'DOCX') : 'TeachFlow',
      updatedAt: lp.updatedAt,
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE MAPPER
  // ═══════════════════════════════════════════════════════════════════════════

  private mapClassroom(cls: any) {
    const activeEnrollments =
      cls.studentEnrollments?.filter((en: any) => en.status === 'ACTIVE' && !en.student?.deletedAt) || [];
    const activeClassStudents =
      cls.classStudents?.filter((cs: any) => cs.status === 'ACTIVE' && !cs.student?.deletedAt) || [];

    const rawStudents = activeEnrollments.length > 0
      ? activeEnrollments.map((en: any) => ({ ...en.student, enrollmentId: en.id }))
      : activeClassStudents.map((cs: any) => cs.student);

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

    const students = rawStudents.filter(Boolean).map((s: any) => {
      const latestComment = s.comments?.[0]?.content || 'Chưa có nhận xét.';
      let studentAtt: number | null = null;
      if (s.studentAttendances && s.studentAttendances.length > 0) {
        const pres = s.studentAttendances.filter((a: any) => a.status === 'PRESENT' || a.status === 'LATE').length;
        studentAtt = Math.round((pres / s.studentAttendances.length) * 100);
      }

      return {
        id: s.id,
        studentCode: s.studentCode || '',
        name: s.fullName,
        fullName: s.fullName,
        initials: s.initials || s.fullName.slice(0, 2).toUpperCase(),
        gender: genderMap[s.gender] || 'Nam',
        dob: s.dobString || (s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString('vi-VN') : 'Chưa cập nhật'),
        guardian: s.parentName || 'Chưa cập nhật',
        phone: s.parentPhone || 'Chưa cập nhật',
        progress: s.status === 'EXCELLENT' ? 90 : s.status === 'GOOD' ? 80 : 70,
        status: statusMap[s.status] || 'Khá',
        attendance: studentAtt,
        note: latestComment,
        color: s.avatarColor || 'bg-teal-100 text-teal-700',
        enrollmentId: s.enrollmentId,
      };
    });

    let calculatedAttendance: number | null = null;
    if (cls.attendanceSessions && cls.attendanceSessions.length > 0) {
      let tot = 0;
      let pres = 0;
      cls.attendanceSessions.forEach((sess: any) => {
        sess.attendances?.forEach((sa: any) => {
          tot++;
          if (sa.status === 'PRESENT' || sa.status === 'LATE') pres++;
        });
      });
      if (tot > 0) {
        calculatedAttendance = Math.round((pres / tot) * 100);
      }
    }

    let calculatedAverage: number | null = null;
    if (cls.assessments && cls.assessments.length > 0) {
      let totScore = 0;
      let count = 0;
      cls.assessments.forEach((a: any) => {
        a.studentAssessments?.forEach((sa: any) => {
          if (typeof sa.score === 'number') {
            totScore += sa.score;
            count++;
          }
        });
      });
      if (count > 0) {
        calculatedAverage = parseFloat((totScore / count).toFixed(1));
      }
    }

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
      average: calculatedAverage,
      attendance: calculatedAttendance,
      teacher: cls.teacher?.fullName ? `Cô ${cls.teacher.fullName}` : 'Cô Nguyễn Thị Mai',
      accent: cls.accent || 'teal',
      status: cls.status || 'ACTIVE',
      isActive: cls.isActive !== undefined ? cls.isActive : true,
      students,
    };
  }
}
