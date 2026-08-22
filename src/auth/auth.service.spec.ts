import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const mockUser = {
    id: 'user-1',
    email: 'teacher@teachflow.vn',
    passwordHash: '',
    role: 'TEACHER',
    isActive: true,
    refreshTokenHash: null,
    teacher: {
      id: 'teacher-1',
      fullName: 'Nguyễn Thị Mai',
      avatarUrl: null,
      phone: '0901234567',
    },
  };

  beforeAll(async () => {
    mockUser.passwordHash = await bcrypt.hash('Password123@', 10);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            teacher: { create: jest.fn() },
            $transaction: jest.fn(async (callback) => callback({
              user: { create: jest.fn().mockResolvedValue({ id: 'registered-user', email: 'new@example.com', role: 'TEACHER', isActive: true }) },
              teacher: { create: jest.fn().mockResolvedValue({ id: 'registered-teacher', fullName: 'Nguyễn Văn A' }) },
            })),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
            verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1' }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def: string) => def),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('normalizes identity and always creates the shared TEACHER account/profile', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);
      const result = await service.register({
        fullName: '  Nguyễn Văn A  ',
        email: '  New@Example.com ',
        password: 'Strong@123',
      });

      expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { email: { equals: 'new@example.com', mode: 'insensitive' } },
      }));
      expect(result.user.role).toBe('TEACHER');
      expect(result.user.teacher.id).toBe('registered-teacher');
    });

    it('rejects an email already created by admin, case-insensitively', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue({ id: 'existing' } as any);
      await expect(service.register({ fullName: 'Teacher', email: 'Teacher@Example.com', password: 'Strong@123' }))
        .rejects.toThrow(ConflictException);
    });

    it('maps the unique-constraint race to a conflict', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);
      (prisma.$transaction as jest.Mock).mockRejectedValue({ code: 'P2002' });
      await expect(service.register({ fullName: 'Teacher', email: 'new@example.com', password: 'Strong@123' }))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser as any);
      jest.spyOn(prisma.user, 'update').mockResolvedValue(mockUser as any);

      const result = await service.login({
        email: 'teacher@teachflow.vn',
        password: 'Password123@',
      });

      expect(result).toBeDefined();
      expect(result.user.email).toBe('teacher@teachflow.vn');
      expect(result.tokens.accessToken).toBe('mock-jwt-token');
      expect(result.tokens.refreshToken).toBe('mock-jwt-token');
    });

    it('should throw UnauthorizedException on invalid password', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser as any);

      await expect(
        service.login({
          email: 'teacher@teachflow.vn',
          password: 'WrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on non-existent user', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

      await expect(
        service.login({
          email: 'unknown@teachflow.vn',
          password: 'Password123@',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject a locked account with ForbiddenException', async () => {
      const disabledUser = { ...mockUser, isActive: false };
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(disabledUser as any);

      await expect(
        service.login({
          email: 'teacher@teachflow.vn',
          password: 'Password123@',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns the actual backend role for an admin account', async () => {
      const admin = { ...mockUser, role: 'ADMIN', teacher: null };
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(admin as any);
      jest.spyOn(prisma.user, 'update').mockResolvedValue(admin as any);
      const result = await service.login({ email: 'TEACHER@TEACHFLOW.VN', password: 'Password123@' });
      expect(result.user.role).toBe('ADMIN');
      expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'teacher@teachflow.vn' } }));
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully if valid', async () => {
      const refreshSecret = 'secret-refresh-123';
      const refreshHash = await bcrypt.hash(refreshSecret, 10);
      const userWithRefresh = { ...mockUser, refreshTokenHash: refreshHash };

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(userWithRefresh as any);
      jest.spyOn(prisma.user, 'update').mockResolvedValue(userWithRefresh as any);

      const tokens = await service.refreshToken('user-1', refreshSecret);
      expect(tokens.accessToken).toBe('mock-jwt-token');
    });

    it('should throw UnauthorizedException if refresh token does not match', async () => {
      const refreshHash = await bcrypt.hash('different-token', 10);
      const userWithRefresh = { ...mockUser, refreshTokenHash: refreshHash };

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(userWithRefresh as any);

      await expect(
        service.refreshToken('user-1', 'invalid-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('does not refresh a locked account session', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ ...mockUser, isActive: false, refreshTokenHash: 'hash' } as any);
      await expect(service.refreshToken('user-1', 'refresh-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  it('logout revokes the refresh-token hash', async () => {
    jest.spyOn(prisma.user, 'update').mockResolvedValue(mockUser as any);
    await service.logout('user-1');
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { refreshTokenHash: null } });
  });

  it('logout verifies and revokes the refresh cookie without a valid access token', async () => {
    const refreshHash = await bcrypt.hash('refresh-token', 10);
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'user-1', refreshTokenHash: refreshHash } as any);
    jest.spyOn(prisma.user, 'update').mockResolvedValue(mockUser as any);
    await service.logout(undefined, 'refresh-token');
    expect(jwtService.verifyAsync).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { refreshTokenHash: null } });
  });
});
