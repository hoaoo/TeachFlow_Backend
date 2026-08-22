import { ConflictException, ForbiddenException, Injectable, UnauthorizedException, BadRequestException, Logger, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Optional() private auditService?: AuditService,
  ) {}

  async register(registerDto: RegisterDto) {
    const normalizedEmail = registerDto.email.trim().toLowerCase();
    const fullName = registerDto.fullName.trim();
    const existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existingUser) {
      await this.auditService?.log({
        action: 'AUTH_REGISTER', actorEmail: normalizedEmail, status: 'FAILURE',
        details: { reason: 'Duplicate email' },
      });
      throw new ConflictException('Email đã được sử dụng.');
    }

    const passwordHash = await bcrypt.hash(registerDto.password, 10);
    try {
      const account = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email: normalizedEmail, passwordHash, role: 'TEACHER', isActive: true },
        });
        const teacher = await tx.teacher.create({ data: { userId: user.id, fullName } });
        return { user, teacher };
      });

      await this.auditService?.log({
        action: 'AUTH_REGISTER',
        actorUserId: account.user.id,
        actorEmail: account.user.email,
        targetUserId: account.user.id,
        resourceType: 'Teacher',
        resourceId: account.teacher.id,
        status: 'SUCCESS',
      });

      return {
        success: true,
        message: 'Tài khoản đã được tạo thành công.',
        user: {
          id: account.user.id,
          email: account.user.email,
          role: 'TEACHER',
          teacher: { id: account.teacher.id, fullName: account.teacher.fullName },
        },
      };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        await this.auditService?.log({
          action: 'AUTH_REGISTER', actorEmail: normalizedEmail, status: 'FAILURE',
          details: { reason: 'Unique constraint conflict' },
        });
        throw new ConflictException('Email đã được sử dụng.');
      }
      throw error;
    }
  }

  async login(loginDto: LoginDto) {
    const email = loginDto.email.trim().toLowerCase();
    const { password } = loginDto;
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { teacher: true },
    });

    if (!user) {
      this.logger.warn(`Login failed for email: ${email} (User not found)`);
      if (this.auditService) {
        await this.auditService.log({
          action: 'AUTH_LOGIN_FAILED',
          actorEmail: email,
          status: 'FAILURE',
          details: { reason: 'User not found' },
        });
      }
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    if (!user.isActive) {
      this.logger.warn(`Login failed for disabled account: ${email}`);
      if (this.auditService) {
        await this.auditService.log({
          action: 'AUTH_LOGIN_FAILED',
          actorUserId: user.id,
          actorEmail: user.email,
          status: 'FAILURE',
          details: { reason: 'Account disabled' },
        });
      }
      throw new ForbiddenException('Tài khoản hiện đang bị khóa.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger.warn(`Login failed for email: ${email} (Invalid password)`);
      if (this.auditService) {
        await this.auditService.log({
          action: 'AUTH_LOGIN_FAILED',
          actorUserId: user.id,
          actorEmail: user.email,
          status: 'FAILURE',
          details: { reason: 'Invalid password' },
        });
      }
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    let teacher = user.teacher;
    if (user.role === 'TEACHER' && !teacher) {
      teacher = await this.prisma.teacher.create({
        data: {
          userId: user.id,
          fullName: user.email.split('@')[0],
        },
      });
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role, teacher?.id);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    if (this.auditService) {
      await this.auditService.log({
        action: 'AUTH_LOGIN',
        actorUserId: user.id,
        actorEmail: user.email,
        status: 'SUCCESS',
      });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        teacher: teacher
          ? {
              id: teacher.id,
              fullName: teacher.fullName,
              avatarUrl: teacher.avatarUrl,
              phone: teacher.phone,
              teachingMode: teacher.teachingMode,
            }
          : null,
      },
      tokens,
    };
  }

  async refreshToken(userId: string, refreshToken: string) {
    if (!userId || !refreshToken) {
      throw new UnauthorizedException('Thông tin refresh token không hợp lệ');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { teacher: true },
    });

    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Truy cập bị từ chối');
    }

    const isMatch = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isMatch) {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã bị thu hồi');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role, user.teacher?.id);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId?: string, refreshToken?: string) {
    let resolvedUserId = userId;
    if (!resolvedUserId && refreshToken) {
      try {
        const payload = await this.jwtService.verifyAsync(refreshToken, {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'dev_jwt_refresh_secret_for_test_only_min_32_chars',
          issuer: this.configService.get<string>('JWT_ISSUER', 'teachflow-backend'),
          audience: this.configService.get<string>('JWT_AUDIENCE', 'teachflow-frontend'),
        });
        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub }, select: { id: true, refreshTokenHash: true },
        });
        if (user?.refreshTokenHash && await bcrypt.compare(refreshToken, user.refreshTokenHash)) {
          resolvedUserId = user.id;
        }
      } catch {
        // Logout remains idempotent and the cookie is still cleared by the controller.
      }
    }
    if (resolvedUserId) {
      await this.prisma.user.update({
        where: { id: resolvedUserId },
        data: { refreshTokenHash: null },
      });
    }
    await this.auditService?.log({ action: 'AUTH_LOGOUT', actorUserId: resolvedUserId, status: 'SUCCESS' });
    return { success: true, message: 'Đăng xuất thành công' };
  }

  async getMe(userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        teacher: {
          include: {
            classrooms: {
              where: { deletedAt: null },
              include: {
                grade: true,
                _count: { select: { classStudents: { where: { status: 'ACTIVE' } } } },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Không tìm thấy người dùng');
    }

    if (user.role === 'TEACHER' && !user.teacher) {
      await this.prisma.teacher.create({
        data: {
          userId: user.id,
          fullName: user.email.split('@')[0],
        },
      });
      return this.getMe(userId);
    }

    const teacher = user.teacher;

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      teacher: teacher
        ? {
            id: teacher.id,
            fullName: teacher.fullName,
            avatarUrl: teacher.avatarUrl,
            phone: teacher.phone,
            teachingMode: teacher.teachingMode,
            classes: (teacher.classrooms || []).map((cls: any) => ({
              id: cls.id,
              name: cls.name,
              grade: cls.grade?.name || 'Khối',
              studentCount: cls._count?.classStudents || 0,
            })),
          }
        : null,
    };
  }

  async updateProfile(userId: string, dto: { fullName?: string; phone?: string; avatarUrl?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { teacher: true },
    });

    if (!user) {
      throw new UnauthorizedException('Không tìm thấy người dùng');
    }

    if (user.role === 'TEACHER') {
      const teacher = user.teacher;
      if (!teacher) {
        await this.prisma.teacher.create({
          data: {
            userId: user.id,
            fullName: dto.fullName || user.email.split('@')[0],
            phone: dto.phone,
            avatarUrl: dto.avatarUrl,
          },
        });
      } else {
        await this.prisma.teacher.update({
          where: { id: teacher.id },
          data: {
            fullName: dto.fullName || undefined,
            phone: dto.phone || undefined,
            avatarUrl: dto.avatarUrl || undefined,
          },
        });
      }
    }

    return this.getMe(userId);
  }

  private async generateTokens(userId: string, email: string, role: string, teacherId?: string) {
    const payload = {
      sub: userId,
      email,
      role,
      teacherId,
    };

    const issuer = this.configService.get<string>('JWT_ISSUER', 'teachflow-backend');
    const audience = this.configService.get<string>('JWT_AUDIENCE', 'teachflow-frontend');
    const accessSecret = this.configService.get<string>('JWT_ACCESS_SECRET') || 'dev_jwt_access_secret_for_test_only_min_32_chars';
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET') || 'dev_jwt_refresh_secret_for_test_only_min_32_chars';
    const accessExpiresIn = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
    const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn as any,
        issuer,
        audience,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn as any,
        issuer,
        audience,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessExpiresIn,
    };
  }

  private async updateRefreshTokenHash(userId: string, refreshToken: string) {
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: hash },
    });
  }
}
