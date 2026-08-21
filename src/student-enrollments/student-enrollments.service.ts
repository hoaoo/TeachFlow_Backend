import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { TransferEnrollmentDto } from './dto/transfer-enrollment.dto';
import { WithdrawEnrollmentDto } from './dto/withdraw-enrollment.dto';
import { EnrollmentStatus } from '@prisma/client';

@Injectable()
export class StudentEnrollmentsService {
  private readonly logger = new Logger(StudentEnrollmentsService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private auditService?: AuditService,
  ) {}

  async findAll(options?: {
    schoolYearId?: string;
    classroomId?: string;
    studentId?: string;
    status?: EnrollmentStatus;
    teacherId?: string;
  }) {
    const where: any = {};

    if (options?.schoolYearId) {
      where.schoolYearId = options.schoolYearId;
    }

    if (options?.classroomId) {
      where.classroomId = options.classroomId;
    }

    if (options?.studentId) {
      where.studentId = options.studentId;
    }

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.teacherId) {
      where.classroom = { teacherId: options.teacherId, deletedAt: null };
    }

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where,
      include: {
        student: true,
        classroom: { include: { grade: true } },
        schoolYear: true,
      },
      orderBy: [
        { schoolYear: { startDate: 'desc' } },
        { enrolledAt: 'desc' },
      ],
    });

    return enrollments.map((e) => this.mapEnrollment(e));
  }

  async findOne(id: string, teacherId?: string) {
    const enrollment = await this.prisma.studentEnrollment.findUnique({
      where: { id },
      include: {
        student: true,
        classroom: { include: { grade: true } },
        schoolYear: true,
      },
    });

    if (!enrollment) {
      throw new NotFoundException(`Không tìm thấy thông tin ghi danh với mã ${id}`);
    }

    if (teacherId && enrollment.classroom.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập thông tin ghi danh này');
    }

    return this.mapEnrollment(enrollment);
  }

  async findByStudent(studentId: string, teacherId?: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student || student.deletedAt) {
      throw new NotFoundException(`Không tìm thấy học sinh với mã ${studentId}`);
    }

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { studentId },
      include: {
        student: true,
        classroom: { include: { grade: true } },
        schoolYear: true,
      },
      orderBy: [
        { schoolYear: { startDate: 'desc' } },
        { enrolledAt: 'desc' },
      ],
    });

    if (teacherId) {
      const hasAccess = enrollments.some(
        (e) => e.classroom.teacherId === teacherId,
      );
      if (!hasAccess) {
        throw new ForbiddenException('Bạn không có quyền truy cập lịch sử ghi danh của học sinh này');
      }
    }

    return enrollments.map((e) => this.mapEnrollment(e));
  }

  async create(dto: CreateEnrollmentDto, currentTeacherId?: string) {
    // 1. Validate Student
    const student = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
    });
    if (!student || student.deletedAt) {
      throw new NotFoundException(`Không tìm thấy học sinh với mã ${dto.studentId}`);
    }

    // 2. Validate SchoolYear
    const schoolYear = await this.prisma.schoolYear.findUnique({
      where: { id: dto.schoolYearId },
    });
    if (!schoolYear) {
      throw new NotFoundException(`Không tìm thấy năm học với mã ${dto.schoolYearId}`);
    }
    if (!schoolYear.isActive) {
      throw new BadRequestException(`Năm học "${schoolYear.name}" đang không ở trạng thái hoạt động`);
    }

    // 3. Validate Classroom
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: dto.classroomId },
    });
    if (!classroom || classroom.deletedAt || !classroom.isActive) {
      throw new BadRequestException(`Lớp học không tồn tại hoặc đã bị vô hiệu hóa`);
    }

    // 4. Invariant: Classroom.schoolYearId === dto.schoolYearId
    if (classroom.schoolYearId !== dto.schoolYearId) {
      throw new BadRequestException(
        `Lớp học "${classroom.name}" không thuộc năm học "${schoolYear.name}"`,
      );
    }

    if (currentTeacherId && classroom.teacherId !== currentTeacherId) {
      throw new ForbiddenException('Bạn không có quyền ghi danh học sinh vào lớp học này');
    }

    // 5. Check if active enrollment already exists in this school year (pre-check for clean error)
    const existingActive = await this.prisma.studentEnrollment.findFirst({
      where: {
        studentId: dto.studentId,
        schoolYearId: dto.schoolYearId,
        status: EnrollmentStatus.ACTIVE,
      },
      include: { classroom: true },
    });

    if (existingActive) {
      throw new ConflictException(
        `Học sinh "${student.fullName}" đã có một lớp học đang hoạt động (${existingActive.classroom.name}) trong năm học này`,
      );
    }

    const enrolledAt = dto.enrolledAt ? new Date(dto.enrolledAt) : new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.studentEnrollment.create({
          data: {
            studentId: dto.studentId,
            schoolYearId: dto.schoolYearId,
            classroomId: dto.classroomId,
            status: EnrollmentStatus.ACTIVE,
            enrolledAt,
            note: dto.note,
          },
          include: {
            student: true,
            classroom: { include: { grade: true } },
            schoolYear: true,
          },
        });

        // Sync legacy ClassStudent compatibility table
        const existingCS = await tx.classStudent.findUnique({
          where: {
            classroomId_studentId: {
              classroomId: dto.classroomId,
              studentId: dto.studentId,
            },
          },
        });

        if (existingCS) {
          await tx.classStudent.update({
            where: { id: existingCS.id },
            data: { status: 'ACTIVE', leftAt: null },
          });
        } else {
          await tx.classStudent.create({
            data: {
              classroomId: dto.classroomId,
              studentId: dto.studentId,
              status: 'ACTIVE',
              joinedAt: enrolledAt,
            },
          });
        }

        this.logger.log(
          `[STUDENT_ENROLLMENT_CREATED] studentId=${dto.studentId} classroomId=${dto.classroomId} schoolYearId=${dto.schoolYearId}`,
        );

        this.auditService?.log({
          actorUserId: currentTeacherId || 'SYSTEM',
          action: 'STUDENT_ENROLL',
          resourceType: 'StudentEnrollment',
          resourceId: created.id,
          targetUserId: dto.studentId,
          details: { studentId: dto.studentId, classroomId: dto.classroomId, schoolYearId: dto.schoolYearId },
        });

        return this.mapEnrollment(created);
      });
    } catch (err: any) {
      if (err.code === 'P2002' || err.message?.includes('StudentEnrollment_active_student_schoolYear_unique')) {
        throw new ConflictException('Học sinh đã có một lớp học đang hoạt động trong năm học này');
      }
      throw err;
    }
  }

  async transfer(id: string, dto: TransferEnrollmentDto, currentTeacherId?: string) {
    const transferDate = dto.transferDate ? new Date(dto.transferDate) : new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Lock and load source enrollment
        const sourceRows = await tx.$queryRaw<any[]>`
          SELECT * FROM "StudentEnrollment"
          WHERE "id" = ${id}
          FOR UPDATE
        `;

        if (!sourceRows || sourceRows.length === 0) {
          throw new NotFoundException(`Không tìm thấy thông tin ghi danh với mã ${id}`);
        }

        const source = sourceRows[0];

        if (source.status !== EnrollmentStatus.ACTIVE) {
          throw new BadRequestException(
            `Không thể chuyển lớp cho bản ghi ghi danh có trạng thái "${source.status}". Chỉ bản ghi ACTIVE mới có thể chuyển lớp.`,
          );
        }

        if (currentTeacherId) {
          const sourceClassroom = await tx.classroom.findUnique({
            where: { id: source.classroomId },
          });

          if (sourceClassroom?.teacherId !== currentTeacherId) {
            throw new ForbiddenException('Bạn không có quyền chuyển học sinh từ lớp học này');
          }
        }

        // 2. Validate target classroom
        const targetClassroom = await tx.classroom.findUnique({
          where: { id: dto.targetClassroomId },
          include: { schoolYear: true },
        });

        if (!targetClassroom || targetClassroom.deletedAt || !targetClassroom.isActive) {
          throw new BadRequestException('Lớp học chuyển đến không tồn tại hoặc đã bị vô hiệu hóa');
        }

        if (targetClassroom.id === source.classroomId) {
          throw new BadRequestException('Lớp học chuyển đến phải khác lớp học hiện tại');
        }

        if (targetClassroom.schoolYearId !== source.schoolYearId) {
          throw new BadRequestException(
            'Không thể chuyển lớp giữa hai năm học khác nhau. Nghiệp vụ này chỉ áp dụng trong cùng năm học.',
          );
        }

        if (targetClassroom.schoolYear && !targetClassroom.schoolYear.isActive) {
          throw new BadRequestException('Không thể chuyển lớp trong năm học đã ngừng hoạt động');
        }

        if (new Date(source.enrolledAt) > transferDate) {
          throw new BadRequestException('Ngày chuyển lớp không thể sớm hơn ngày nhập học ban đầu');
        }

        // 3. Update source enrollment -> TRANSFERRED
        await tx.studentEnrollment.update({
          where: { id: source.id },
          data: {
            status: EnrollmentStatus.TRANSFERRED,
            leftAt: transferDate,
            transferReason: dto.reason || 'Chuyển lớp',
          },
        });

        // 4. Create new enrollment -> ACTIVE
        const targetEnrollment = await tx.studentEnrollment.create({
          data: {
            studentId: source.studentId,
            schoolYearId: source.schoolYearId,
            classroomId: targetClassroom.id,
            status: EnrollmentStatus.ACTIVE,
            enrolledAt: transferDate,
            leftAt: null,
            note: dto.reason ? `Chuyển từ lớp trước: ${dto.reason}` : undefined,
          },
          include: {
            student: true,
            classroom: { include: { grade: true } },
            schoolYear: true,
          },
        });

        // 5. Sync legacy ClassStudent compatibility table
        // Deactivate old class membership
        const oldCS = await tx.classStudent.findUnique({
          where: {
            classroomId_studentId: {
              classroomId: source.classroomId,
              studentId: source.studentId,
            },
          },
        });
        if (oldCS) {
          await tx.classStudent.update({
            where: { id: oldCS.id },
            data: { status: 'INACTIVE', leftAt: transferDate },
          });
        }

        // Activate new class membership
        const newCS = await tx.classStudent.findUnique({
          where: {
            classroomId_studentId: {
              classroomId: targetClassroom.id,
              studentId: source.studentId,
            },
          },
        });
        if (newCS) {
          await tx.classStudent.update({
            where: { id: newCS.id },
            data: { status: 'ACTIVE', leftAt: null },
          });
        } else {
          await tx.classStudent.create({
            data: {
              classroomId: targetClassroom.id,
              studentId: source.studentId,
              status: 'ACTIVE',
              joinedAt: transferDate,
            },
          });
        }

        this.logger.log(
          `[STUDENT_TRANSFERRED] studentId=${source.studentId} sourceClass=${source.classroomId} targetClass=${targetClassroom.id} transferDate=${transferDate.toISOString()}`,
        );

        this.auditService?.log({
          actorUserId: currentTeacherId || 'SYSTEM',
          action: 'STUDENT_TRANSFER',
          resourceType: 'StudentEnrollment',
          resourceId: targetEnrollment.id,
          targetUserId: source.studentId,
          details: {
            studentId: source.studentId,
            sourceClassroomId: source.classroomId,
            targetClassroomId: targetClassroom.id,
            reason: dto.reason,
          },
        });

        return this.mapEnrollment(targetEnrollment);
      });
    } catch (err: any) {
      if (err.code === 'P2002' || err.message?.includes('StudentEnrollment_active_student_schoolYear_unique')) {
        throw new ConflictException(
          'Xung đột khi chuyển lớp: Học sinh đã có một lớp học hoạt động trong năm học này',
        );
      }
      throw err;
    }
  }

  async withdraw(id: string, dto: WithdrawEnrollmentDto, currentTeacherId?: string) {
    const withdrawDate = dto.withdrawDate ? new Date(dto.withdrawDate) : new Date();

    return await this.prisma.$transaction(async (tx) => {
      const source = await tx.studentEnrollment.findUnique({
        where: { id },
        include: { classroom: true },
      });

      if (!source) {
        throw new NotFoundException(`Không tìm thấy thông tin ghi danh với mã ${id}`);
      }

      if (currentTeacherId && source.classroom.teacherId !== currentTeacherId) {
        throw new ForbiddenException('Bạn không có quyền rút học sinh khỏi lớp học này');
      }

      if (source.status !== EnrollmentStatus.ACTIVE) {
        throw new BadRequestException(
          `Không thể rút học sinh có trạng thái "${source.status}". Chỉ bản ghi ACTIVE mới có thể rút.`,
        );
      }

      const updated = await tx.studentEnrollment.update({
        where: { id },
        data: {
          status: EnrollmentStatus.WITHDRAWN,
          leftAt: withdrawDate,
          note: dto.reason || 'Rút hồ sơ/Nghỉ học',
        },
        include: {
          student: true,
          classroom: { include: { grade: true } },
          schoolYear: true,
        },
      });

      // Sync legacy ClassStudent
      const cs = await tx.classStudent.findUnique({
        where: {
          classroomId_studentId: {
            classroomId: source.classroomId,
            studentId: source.studentId,
          },
        },
      });
      if (cs) {
        await tx.classStudent.update({
          where: { id: cs.id },
          data: { status: 'INACTIVE', leftAt: withdrawDate },
        });
      }

      this.logger.log(
        `[STUDENT_WITHDRAWN] studentId=${source.studentId} classroomId=${source.classroomId} withdrawDate=${withdrawDate.toISOString()}`,
      );

      this.auditService?.log({
        actorUserId: currentTeacherId || 'SYSTEM',
        action: 'STUDENT_WITHDRAW',
        resourceType: 'StudentEnrollment',
        resourceId: updated.id,
        targetUserId: updated.studentId,
        details: { studentId: updated.studentId, classroomId: updated.classroomId, reason: dto.reason },
      });

      return this.mapEnrollment(updated);
    });
  }

  private mapEnrollment(e: any) {
    return {
      id: e.id,
      studentId: e.studentId,
      student: e.student
        ? {
            id: e.student.id,
            studentCode: e.student.studentCode,
            fullName: e.student.fullName,
            gender: e.student.gender,
            dob: e.student.dobString || (e.student.dateOfBirth ? new Date(e.student.dateOfBirth).toLocaleDateString('vi-VN') : 'Chưa cập nhật'),
            status: e.student.status,
          }
        : undefined,
      schoolYearId: e.schoolYearId,
      schoolYear: e.schoolYear
        ? {
            id: e.schoolYear.id,
            name: e.schoolYear.name,
            isCurrent: e.schoolYear.isCurrent,
          }
        : undefined,
      classroomId: e.classroomId,
      classroom: e.classroom
        ? {
            id: e.classroom.id,
            code: e.classroom.code,
            name: e.classroom.name,
            gradeName: e.classroom.grade?.name,
            room: e.classroom.room,
          }
        : undefined,
      status: e.status,
      enrolledAt: e.enrolledAt,
      leftAt: e.leftAt,
      transferReason: e.transferReason,
      note: e.note,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}
