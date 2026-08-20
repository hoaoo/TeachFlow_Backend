import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { UpdateTeacherStatusDto } from './dto/update-teacher-status.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AdminTeacherQueryDto } from './dto/admin-teacher-query.dto';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

export interface TeacherResponse {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AdminTeachersService {
  private readonly logger = new Logger(AdminTeachersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List teachers with search, status filter and database-level pagination
   */
  async listTeachers(query: AdminTeacherQueryDto): Promise<PaginatedResultDto<TeacherResponse>> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(Math.max(1, query.pageSize || 20), 100);
    const skip = (page - 1) * pageSize;

    const where: any = {
      user: {
        role: 'TEACHER',
      },
    };

    if (query.status && query.status !== 'ALL') {
      where.user.isActive = query.status === 'ACTIVE';
    }

    if (query.keyword && query.keyword.trim()) {
      const kw = query.keyword.trim();
      where.OR = [
        { fullName: { contains: kw, mode: 'insensitive' } },
        { phone: { contains: kw, mode: 'insensitive' } },
        { user: { email: { contains: kw, mode: 'insensitive' } } },
      ];
    }

    const [totalItems, teachers] = await Promise.all([
      this.prisma.teacher.count({ where }),
      this.prisma.teacher.findMany({
        where,
        include: { user: true },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const items = teachers.map((t) => this.mapTeacher(t));
    return new PaginatedResultDto(items, totalItems, page, pageSize);
  }

  /**
   * Get single teacher by ID
   */
  async getTeacher(id: string): Promise<TeacherResponse> {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!teacher) {
      throw new NotFoundException('Không tìm thấy thông tin giáo viên');
    }

    return this.mapTeacher(teacher);
  }

  /**
   * Create new teacher account inside a transaction
   */
  async createTeacher(
    dto: CreateTeacherDto,
    actorUser: AuthenticatedUser,
  ): Promise<TeacherResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Check duplicate email case-insensitive
    const existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    });

    if (existingUser) {
      throw new ConflictException('Email đã được sử dụng.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const createdTeacher = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: 'TEACHER',
          isActive: true,
        },
      });

      const teacher = await tx.teacher.create({
        data: {
          userId: user.id,
          fullName: dto.fullName.trim(),
          phone: dto.phone?.trim() || null,
        },
        include: { user: true },
      });

      return teacher;
    });

    // Write audit log
    await this.prisma.adminAuditLog.create({
      data: {
        actorUserId: actorUser.userId,
        action: 'CREATE_TEACHER',
        targetUserId: createdTeacher.userId,
        details: `Created teacher ${createdTeacher.fullName} (${createdTeacher.user.email})`,
      },
    });

    this.logger.log(
      `[ADMIN_AUDIT] actor=${actorUser.email} action=CREATE_TEACHER targetUserId=${createdTeacher.userId} teacherName="${createdTeacher.fullName}"`,
    );

    return this.mapTeacher(createdTeacher);
  }

  /**
   * Update teacher details (fullName, email, phone)
   */
  async updateTeacher(
    id: string,
    dto: UpdateTeacherDto,
    actorUser: AuthenticatedUser,
  ): Promise<TeacherResponse> {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!teacher) {
      throw new NotFoundException('Không tìm thấy thông tin giáo viên');
    }

    if (dto.email) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      const duplicate = await this.prisma.user.findFirst({
        where: {
          email: { equals: normalizedEmail, mode: 'insensitive' },
          id: { not: teacher.userId },
        },
      });

      if (duplicate) {
        throw new ConflictException('Email đã được sử dụng.');
      }
    }

    const updatedTeacher = await this.prisma.$transaction(async (tx) => {
      if (dto.email) {
        await tx.user.update({
          where: { id: teacher.userId },
          data: { email: dto.email.trim().toLowerCase() },
        });
      }

      const t = await tx.teacher.update({
        where: { id },
        data: {
          fullName: dto.fullName !== undefined ? dto.fullName.trim() : undefined,
          phone: dto.phone !== undefined ? (dto.phone ? dto.phone.trim() : null) : undefined,
        },
        include: { user: true },
      });

      return t;
    });

    // Write audit log
    await this.prisma.adminAuditLog.create({
      data: {
        actorUserId: actorUser.userId,
        action: 'UPDATE_TEACHER',
        targetUserId: updatedTeacher.userId,
        details: `Updated teacher details for ID=${id}`,
      },
    });

    this.logger.log(
      `[ADMIN_AUDIT] actor=${actorUser.email} action=UPDATE_TEACHER targetUserId=${updatedTeacher.userId}`,
    );

    return this.mapTeacher(updatedTeacher);
  }

  /**
   * Enable or disable teacher account
   */
  async updateTeacherStatus(
    id: string,
    dto: UpdateTeacherStatusDto,
    actorUser: AuthenticatedUser,
  ) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!teacher) {
      throw new NotFoundException('Không tìm thấy thông tin giáo viên');
    }

    // Prevent admin from disabling their own account
    if (teacher.userId === actorUser.userId && !dto.isActive) {
      throw new ConflictException('Không thể khóa tài khoản đang đăng nhập.');
    }

    await this.prisma.user.update({
      where: { id: teacher.userId },
      data: {
        isActive: dto.isActive,
        refreshTokenHash: dto.isActive ? undefined : null, // Invalidate sessions on disable
      },
    });

    const action = dto.isActive ? 'ENABLE_TEACHER' : 'DISABLE_TEACHER';

    await this.prisma.adminAuditLog.create({
      data: {
        actorUserId: actorUser.userId,
        action,
        targetUserId: teacher.userId,
        details: `${dto.isActive ? 'Enabled' : 'Disabled'} teacher account ID=${id}`,
      },
    });

    this.logger.log(
      `[ADMIN_AUDIT] actor=${actorUser.email} action=${action} targetUserId=${teacher.userId}`,
    );

    return {
      success: true,
      message: dto.isActive
        ? 'Đã mở khóa tài khoản giáo viên thành công'
        : 'Đã khóa tài khoản giáo viên thành công',
      isActive: dto.isActive,
    };
  }

  /**
   * Reset teacher password and revoke refresh session
   */
  async resetTeacherPassword(
    id: string,
    dto: ResetPasswordDto,
    actorUser: AuthenticatedUser,
  ) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!teacher) {
      throw new NotFoundException('Không tìm thấy thông tin giáo viên');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    // Invalidate refresh session so old token cannot refresh
    await this.prisma.user.update({
      where: { id: teacher.userId },
      data: {
        passwordHash,
        refreshTokenHash: null,
      },
    });

    await this.prisma.adminAuditLog.create({
      data: {
        actorUserId: actorUser.userId,
        action: 'RESET_TEACHER_PASSWORD',
        targetUserId: teacher.userId,
        details: `Reset password for teacher ID=${id}`,
      },
    });

    this.logger.log(
      `[ADMIN_AUDIT] actor=${actorUser.email} action=RESET_TEACHER_PASSWORD targetUserId=${teacher.userId}`,
    );

    return {
      success: true,
      message: 'Mật khẩu đã được cập nhật. Giáo viên cần đăng nhập lại.',
    };
  }

  private mapTeacher(t: any): TeacherResponse {
    return {
      id: t.id,
      userId: t.userId,
      fullName: t.fullName,
      email: t.user?.email || '',
      phone: t.phone,
      avatarUrl: t.avatarUrl,
      isActive: t.user?.isActive ?? true,
      role: t.user?.role || 'TEACHER',
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
}
