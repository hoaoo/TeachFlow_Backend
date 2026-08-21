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
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTeachingAssignmentDto } from './dto/create-teaching-assignment.dto';
import { UpdateTeachingAssignmentDto } from './dto/update-teaching-assignment.dto';
import { Role, NotificationType } from '@prisma/client';

@Injectable()
export class TeachingAssignmentsService {
  private readonly logger = new Logger(TeachingAssignmentsService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private auditService?: AuditService,
    @Optional() private notificationsService?: NotificationsService,
  ) {}

  async findAll(options?: {
    schoolYearId?: string;
    teacherId?: string;
    classroomId?: string;
    subjectId?: string;
    isActive?: boolean;
    search?: string;
  }) {
    const where: any = {};

    if (options?.schoolYearId) {
      where.schoolYearId = options.schoolYearId;
    }

    if (options?.teacherId) {
      where.teacherId = options.teacherId;
    }

    if (options?.classroomId) {
      where.classroomId = options.classroomId;
    }

    if (options?.subjectId) {
      where.subjectId = options.subjectId;
    }

    if (options?.isActive !== undefined) {
      where.isActive = options.isActive;
    }

    if (options?.search) {
      const term = options.search.trim();
      where.OR = [
        { teacher: { fullName: { contains: term, mode: 'insensitive' } } },
        { classroom: { name: { contains: term, mode: 'insensitive' } } },
        { classroom: { code: { contains: term, mode: 'insensitive' } } },
        { subject: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const assignments = await this.prisma.teachingAssignment.findMany({
      where,
      include: {
        teacher: { select: { id: true, fullName: true, phone: true } },
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
      },
      orderBy: [
        { schoolYear: { startDate: 'desc' } },
        { classroom: { name: 'asc' } },
        { subject: { sortOrder: 'asc' } },
      ],
    });

    return assignments.map((a) => this.mapAssignment(a));
  }

  async findOne(id: string, teacherId?: string) {
    const assignment = await this.prisma.teachingAssignment.findUnique({
      where: { id },
      include: {
        teacher: { select: { id: true, fullName: true, phone: true } },
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException(`Không tìm thấy phân công giảng dạy với mã ${id}`);
    }

    if (teacherId && assignment.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập phân công giảng dạy này');
    }

    return this.mapAssignment(assignment);
  }

  async findMyAssignments(teacherId: string, schoolYearId?: string) {
    if (!teacherId) {
      throw new ForbiddenException('Không xác định được danh tính giáo viên');
    }

    const where: any = {
      teacherId,
      isActive: true,
    };

    if (schoolYearId) {
      where.schoolYearId = schoolYearId;
    }

    const assignments = await this.prisma.teachingAssignment.findMany({
      where,
      include: {
        teacher: { select: { id: true, fullName: true, phone: true } },
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
      },
      orderBy: [
        { schoolYear: { startDate: 'desc' } },
        { classroom: { name: 'asc' } },
        { subject: { sortOrder: 'asc' } },
      ],
    });

    return assignments.map((a) => this.mapAssignment(a));
  }

  async create(dto: CreateTeachingAssignmentDto) {
    // 1. Validate Teacher
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: dto.teacherId },
      include: { user: true },
    });

    if (!teacher) {
      throw new NotFoundException(`Không tìm thấy giáo viên với mã ${dto.teacherId}`);
    }

    if (teacher.user && teacher.user.role !== Role.TEACHER) {
      throw new BadRequestException('Người dùng được phân công không có vai trò Giáo viên');
    }

    if (teacher.user && !teacher.user.isActive) {
      throw new BadRequestException(`Tài khoản của giáo viên "${teacher.fullName}" đang bị khóa`);
    }

    // 2. Validate Classroom
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: dto.classroomId },
    });

    if (!classroom || classroom.deletedAt) {
      throw new NotFoundException(`Không tìm thấy lớp học với mã ${dto.classroomId}`);
    }

    if (!classroom.isActive) {
      throw new BadRequestException(`Lớp học "${classroom.name}" đang không ở trạng thái hoạt động`);
    }

    // 3. Validate Subject
    const subject = await this.prisma.subject.findUnique({
      where: { id: dto.subjectId },
    });

    if (!subject) {
      throw new NotFoundException(`Không tìm thấy môn học với mã ${dto.subjectId}`);
    }

    if (!subject.isActive) {
      throw new BadRequestException(`Môn học "${subject.name}" đang không ở trạng thái hoạt động`);
    }

    // 4. Invariant: SchoolYear consistency
    const targetSchoolYearId = dto.schoolYearId || classroom.schoolYearId;
    if (dto.schoolYearId && dto.schoolYearId !== classroom.schoolYearId) {
      throw new BadRequestException(
        `Lớp học "${classroom.name}" không thuộc năm học đã chọn`,
      );
    }

    // 5. Validate SchoolYear
    const schoolYear = await this.prisma.schoolYear.findUnique({
      where: { id: targetSchoolYearId },
    });

    if (!schoolYear) {
      throw new NotFoundException(`Không tìm thấy năm học với mã ${targetSchoolYearId}`);
    }

    if (!schoolYear.isActive) {
      throw new BadRequestException(`Năm học "${schoolYear.name}" đang không ở trạng thái hoạt động`);
    }

    // 6. Pre-check for duplicate active assignment
    const existing = await this.prisma.teachingAssignment.findFirst({
      where: {
        teacherId: dto.teacherId,
        classroomId: dto.classroomId,
        subjectId: dto.subjectId,
        schoolYearId: targetSchoolYearId,
        isActive: true,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Giáo viên "${teacher.fullName}" đã được phân công dạy môn "${subject.name}" tại lớp "${classroom.name}" trong năm học "${schoolYear.name}"`,
      );
    }

    try {
      const assignment = await this.prisma.teachingAssignment.create({
        data: {
          teacherId: dto.teacherId,
          classroomId: dto.classroomId,
          subjectId: dto.subjectId,
          schoolYearId: targetSchoolYearId,
          isActive: true,
        },
        include: {
          teacher: { select: { id: true, fullName: true, phone: true } },
          classroom: { include: { grade: true } },
          subject: true,
          schoolYear: true,
        },
      });

      this.logger.log(
        `[TEACHING_ASSIGNMENT_CREATED] id=${assignment.id} teacherId=${dto.teacherId} classroomId=${dto.classroomId} subjectId=${dto.subjectId} schoolYearId=${targetSchoolYearId}`,
      );

      this.auditService?.log({
        actorUserId: 'ADMIN',
        action: 'TEACHING_ASSIGNMENT_CREATE',
        resourceType: 'TeachingAssignment',
        resourceId: assignment.id,
        targetUserId: dto.teacherId,
        details: { teacherId: dto.teacherId, classroomId: dto.classroomId, subjectId: dto.subjectId, schoolYearId: targetSchoolYearId },
      });

      // Send in-app notification to teacher
      this.notificationsService?.createNotification({
        teacherId: dto.teacherId,
        title: 'Phân công giảng dạy mới',
        message: `Bạn được phân công giảng dạy môn ${assignment.subject.name} tại lớp ${assignment.classroom.name} (${assignment.schoolYear.name}).`,
        type: NotificationType.ASSIGNMENT,
      });

      return this.mapAssignment(assignment);
    } catch (err: any) {
      if (
        err.code === 'P2002' ||
        err.message?.includes('TeachingAssignment_teacher_classroom_subject_schoolYear_unique')
      ) {
        throw new ConflictException('Phân công giảng dạy này đã tồn tại trong hệ thống');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateTeachingAssignmentDto) {
    const existing = await this.prisma.teachingAssignment.findUnique({
      where: { id },
      include: { classroom: true, subject: true, schoolYear: true, teacher: true },
    });

    if (!existing) {
      throw new NotFoundException(`Không tìm thấy phân công giảng dạy với mã ${id}`);
    }

    const teacherId = dto.teacherId || existing.teacherId;
    const classroomId = dto.classroomId || existing.classroomId;
    const subjectId = dto.subjectId || existing.subjectId;
    const schoolYearId = existing.schoolYearId;

    const isIdentityMutating =
      (dto.teacherId && dto.teacherId !== existing.teacherId) ||
      (dto.classroomId && dto.classroomId !== existing.classroomId) ||
      (dto.subjectId && dto.subjectId !== existing.subjectId);

    if (isIdentityMutating) {
      const [lessonPlanCount, attendanceCount, assessmentCount] = await Promise.all([
        this.prisma.lessonPlan.count({ where: { teachingAssignmentId: id, deletedAt: null } }),
        this.prisma.attendanceSession.count({ where: { teachingAssignmentId: id } }),
        this.prisma.assessment.count({ where: { teachingAssignmentId: id, deletedAt: null } }),
      ]);

      const totalReferences = lessonPlanCount + attendanceCount + assessmentCount;
      if (totalReferences > 0) {
        throw new BadRequestException(
          `Không thể thay đổi giáo viên, lớp học hoặc môn học của phân công đã được liên kết với ${totalReferences} tài nguyên (giáo án, điểm danh, đánh giá). Vui lòng vô hiệu hóa phân công này và tạo phân công mới.`,
        );
      }
    }

    if (dto.teacherId && dto.teacherId !== existing.teacherId) {
      const t = await this.prisma.teacher.findUnique({ where: { id: dto.teacherId }, include: { user: true } });
      if (!t) throw new NotFoundException(`Không tìm thấy giáo viên với mã ${dto.teacherId}`);
      if (t.user && t.user.role !== Role.TEACHER) throw new BadRequestException('Người dùng không phải là Giáo viên');
    }

    if (dto.classroomId && dto.classroomId !== existing.classroomId) {
      const c = await this.prisma.classroom.findUnique({ where: { id: dto.classroomId } });
      if (!c || c.deletedAt) throw new NotFoundException(`Không tìm thấy lớp học với mã ${dto.classroomId}`);
      if (c.schoolYearId !== existing.schoolYearId) {
        throw new BadRequestException('Không thể chuyển phân công sang lớp thuộc năm học khác');
      }
    }

    if (dto.subjectId && dto.subjectId !== existing.subjectId) {
      const s = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
      if (!s) throw new NotFoundException(`Không tìm thấy môn học với mã ${dto.subjectId}`);
    }

    if (
      (dto.teacherId && dto.teacherId !== existing.teacherId) ||
      (dto.classroomId && dto.classroomId !== existing.classroomId) ||
      (dto.subjectId && dto.subjectId !== existing.subjectId) ||
      (dto.isActive === true && existing.isActive === false)
    ) {
      const duplicate = await this.prisma.teachingAssignment.findFirst({
        where: {
          teacherId,
          classroomId,
          subjectId,
          schoolYearId,
          isActive: true,
          NOT: { id },
        },
      });

      if (duplicate) {
        throw new ConflictException('Phân công giảng dạy tương tự đã tồn tại và đang hoạt động');
      }
    }

    try {
      const updated = await this.prisma.teachingAssignment.update({
        where: { id },
        data: {
          teacherId,
          classroomId,
          subjectId,
          isActive: dto.isActive !== undefined ? dto.isActive : undefined,
        },
        include: {
          teacher: { select: { id: true, fullName: true, phone: true } },
          classroom: { include: { grade: true } },
          subject: true,
          schoolYear: true,
        },
      });

      this.logger.log(`[TEACHING_ASSIGNMENT_UPDATED] id=${id} isActive=${updated.isActive}`);

      this.auditService?.log({
        actorUserId: 'ADMIN',
        action: 'TEACHING_ASSIGNMENT_UPDATE',
        resourceType: 'TeachingAssignment',
        resourceId: id,
        targetUserId: updated.teacherId,
        details: { teacherId, classroomId, subjectId, isActive: updated.isActive },
      });

      return this.mapAssignment(updated);
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('Phân công giảng dạy tương tự đã tồn tại trong hệ thống');
      }
      throw err;
    }
  }

  async deactivate(id: string) {
    await this.findOne(id);

    const deactivated = await this.prisma.teachingAssignment.update({
      where: { id },
      data: { isActive: false },
      include: {
        teacher: { select: { id: true, fullName: true, phone: true } },
        classroom: { include: { grade: true } },
        subject: true,
        schoolYear: true,
      },
    });

    this.logger.log(`[TEACHING_ASSIGNMENT_DEACTIVATED] id=${id}`);

    this.auditService?.log({
      actorUserId: 'ADMIN',
      action: 'TEACHING_ASSIGNMENT_DEACTIVATE',
      resourceType: 'TeachingAssignment',
      resourceId: id,
      targetUserId: deactivated.teacherId,
    });

    return this.mapAssignment(deactivated);
  }

  async existsActiveAssignment(
    teacherId: string,
    classroomId: string,
    subjectId?: string,
    schoolYearId?: string,
  ): Promise<boolean> {
    const where: any = {
      teacherId,
      classroomId,
      isActive: true,
    };

    if (subjectId) {
      where.subjectId = subjectId;
    }

    if (schoolYearId) {
      where.schoolYearId = schoolYearId;
    }

    const count = await this.prisma.teachingAssignment.count({ where });
    return count > 0;
  }

  private mapAssignment(a: any) {
    return {
      id: a.id,
      teacherId: a.teacherId,
      teacher: a.teacher
        ? {
            id: a.teacher.id,
            fullName: a.teacher.fullName,
            phone: a.teacher.phone,
          }
        : undefined,
      classroomId: a.classroomId,
      classroom: a.classroom
        ? {
            id: a.classroom.id,
            code: a.classroom.code,
            name: a.classroom.name,
            gradeName: a.classroom.grade?.name,
            room: a.classroom.room,
          }
        : undefined,
      subjectId: a.subjectId,
      subject: a.subject
        ? {
            id: a.subject.id,
            code: a.subject.code,
            name: a.subject.name,
          }
        : undefined,
      schoolYearId: a.schoolYearId,
      schoolYear: a.schoolYear
        ? {
            id: a.schoolYear.id,
            name: a.schoolYear.name,
            isCurrent: a.schoolYear.isCurrent,
          }
        : undefined,
      isActive: a.isActive,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}
