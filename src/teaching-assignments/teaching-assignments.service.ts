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
    // 1. Validate Teacher (dto.teacherId was injected by controller from JWT)
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: dto.teacherId },
      include: { user: true },
    });

    if (!teacher) {
      throw new NotFoundException(`Không tìm thấy giáo viên với mã ${dto.teacherId}`);
    }

    if (teacher.user && teacher.user.role !== Role.TEACHER) {
      throw new BadRequestException('Tài khoản này không có vai trò Giáo viên');
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

    // 6. Pre-check for duplicate active teaching context
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
        `Bạn đã khai báo dạy môn "${subject.name}" tại lớp "${classroom.name}" trong năm học "${schoolYear.name}"`,
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
        `[TEACHING_CONTEXT_DECLARED] id=${assignment.id} teacherId=${dto.teacherId} classroomId=${dto.classroomId} subjectId=${dto.subjectId} schoolYearId=${targetSchoolYearId}`,
      );

      // Audit with teacher as actor (self-declaration, not admin action)
      this.auditService?.log({
        actorUserId: teacher.user?.id ?? dto.teacherId,
        action: 'TEACHING_CONTEXT_DECLARE',
        resourceType: 'TeachingAssignment',
        resourceId: assignment.id,
        targetUserId: dto.teacherId,
        details: { teacherId: dto.teacherId, classroomId: dto.classroomId, subjectId: dto.subjectId, schoolYearId: targetSchoolYearId },
      });

      // Send in-app notification to teacher confirming their own declaration
      this.notificationsService?.createNotification({
        teacherId: dto.teacherId,
        title: 'Khai báo ngữ cảnh giảng dạy thành công',
        message: `Bạn đã khai báo môn ${assignment.subject.name} tại lớp ${assignment.classroom.name} (${assignment.schoolYear.name}).`,
        type: NotificationType.ASSIGNMENT,
      });

      return this.mapAssignment(assignment);
    } catch (err: any) {
      if (
        err.code === 'P2002' ||
        err.message?.includes('TeachingAssignment_teacher_classroom_subject_schoolYear_unique')
      ) {
        throw new ConflictException('Ngữ cảnh giảng dạy này đã tồn tại trong hệ thống');
      }
      throw err;
    }
  }


  async update(
    id: string,
    dto: UpdateTeachingAssignmentDto,
    currentTeacherId?: string,
  ) {
    const existing = await this.findOne(id, currentTeacherId);

    // teacherId is immutable — always kept from existing record
    const teacherId = existing.teacher.id;
    const classroomId = dto.classroomId || existing.classroom.id;
    const subjectId = dto.subjectId || existing.subject.id;
    const schoolYearId = existing.schoolYear.id;

    // Check if classroom/subject is being changed (teacher-scoped identity mutation)
    const isIdentityMutating =
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
          `Không thể thay đổi lớp học hoặc môn học của ngữ cảnh giảng dạy đã được liên kết với ${totalReferences} tài nguyên (giáo án, điểm danh, đánh giá). Vui lòng hủy ngữ cảnh này và tạo mới.`,
        );
      }
    }

    if (dto.classroomId && dto.classroomId !== existing.classroomId) {
      const c = await this.prisma.classroom.findUnique({ where: { id: dto.classroomId } });
      if (!c || c.deletedAt) throw new NotFoundException(`Không tìm thấy lớp học với mã ${dto.classroomId}`);
      if (c.schoolYearId !== existing.schoolYearId) {
        throw new BadRequestException('Không thể chuyển ngữ cảnh giảng dạy sang lớp thuộc năm học khác');
      }
    }

    if (dto.subjectId && dto.subjectId !== existing.subjectId) {
      const s = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
      if (!s) throw new NotFoundException(`Không tìm thấy môn học với mã ${dto.subjectId}`);
    }

    if (
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
        throw new ConflictException('Ngữ cảnh giảng dạy tương tự đã tồn tại và đang hoạt động');
      }
    }

    try {
      const updated = await this.prisma.teachingAssignment.update({
        where: { id },
        data: {
          // teacherId is never updated — ownership is immutable
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

      this.logger.log(`[TEACHING_CONTEXT_UPDATED] id=${id} teacherId=${teacherId} isActive=${updated.isActive}`);

      // Audit with teacher as actor
      this.auditService?.log({
        actorUserId: currentTeacherId ?? teacherId,
        action: 'TEACHING_CONTEXT_UPDATE',
        resourceType: 'TeachingAssignment',
        resourceId: id,
        targetUserId: updated.teacherId,
        details: { teacherId, classroomId, subjectId, isActive: updated.isActive },
      });

      return this.mapAssignment(updated);
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('Ngữ cảnh giảng dạy tương tự đã tồn tại trong hệ thống');
      }
      throw err;
    }
  }

  async deactivate(id: string, currentTeacherId?: string) {
    await this.findOne(id, currentTeacherId);

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

    this.logger.log(`[TEACHING_CONTEXT_DEACTIVATED] id=${id} teacherId=${deactivated.teacherId}`);

    // Audit with teacher as actor (self-managed deactivation)
    this.auditService?.log({
      actorUserId: currentTeacherId ?? deactivated.teacherId,
      action: 'TEACHING_CONTEXT_DEACTIVATE',
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
