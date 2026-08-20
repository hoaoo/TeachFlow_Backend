import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
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
              update: jest.fn(),
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
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

    it('should throw UnauthorizedException on disabled account', async () => {
      const disabledUser = { ...mockUser, isActive: false };
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(disabledUser as any);

      await expect(
        service.login({
          email: 'teacher@teachflow.vn',
          password: 'Password123@',
        }),
      ).rejects.toThrow(UnauthorizedException);
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
  });
});
