import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AdminTeachersService } from './admin-teachers.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AdminTeachersService', () => {
  let service: AdminTeachersService;
  let prisma: PrismaService;

  const mockAdminUser = {
    userId: 'admin-user-id',
    email: 'admin@teachflow.vn',
    role: 'ADMIN',
  };

  const mockTeacherData = {
    id: 'teacher-1',
    userId: 'user-teacher-1',
    fullName: 'Nguyễn Thị Lan',
    phone: '0988123456',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: 'user-teacher-1',
      email: 'lan@teachflow.vn',
      role: 'TEACHER',
      isActive: true,
    },
  };

  const mockPrisma = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    teacher: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    adminAuditLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminTeachersService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<AdminTeachersService>(AdminTeachersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTeacher', () => {
    it('should create teacher in transaction and record audit log', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          user: { create: jest.fn().mockResolvedValue({ id: 'u-1', email: 'lan@teachflow.vn' }) },
          teacher: { create: jest.fn().mockResolvedValue(mockTeacherData) },
        };
        return cb(tx);
      });

      const dto = {
        email: '  Lan@Teachflow.vn  ',
        fullName: 'Nguyễn Thị Lan',
        phone: '0988123456',
        password: 'Password123@',
      };

      const result = await service.createTeacher(dto, mockAdminUser);

      expect(result.email).toBe('lan@teachflow.vn');
      expect(result.fullName).toBe('Nguyễn Thị Lan');
      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREATE_TEACHER',
            actorUserId: 'admin-user-id',
          }),
        }),
      );
    });

    it('should throw ConflictException on duplicate email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'existing-id', email: 'lan@teachflow.vn' });

      const dto = {
        email: 'lan@teachflow.vn',
        fullName: 'Nguyễn Thị Lan',
        password: 'Password123@',
      };

      await expect(service.createTeacher(dto, mockAdminUser)).rejects.toThrow(ConflictException);
    });
  });

  describe('updateTeacherStatus', () => {
    it('should prevent admin from disabling their own account', async () => {
      mockPrisma.teacher.findUnique.mockResolvedValue({
        id: 'admin-teacher-id',
        userId: 'admin-user-id', // matches actorUser.userId
        user: { id: 'admin-user-id', role: 'TEACHER', isActive: true },
      });

      await expect(
        service.updateTeacherStatus('admin-teacher-id', { isActive: false }, mockAdminUser),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject mutating account if target role is not TEACHER', async () => {
      mockPrisma.teacher.findUnique.mockResolvedValue({
        id: 'admin-other-id',
        userId: 'admin-other-user',
        user: { id: 'admin-other-user', role: 'ADMIN', isActive: true },
      });

      await expect(
        service.updateTeacherStatus('admin-other-id', { isActive: false }, mockAdminUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update teacher status and record audit log', async () => {
      mockPrisma.teacher.findUnique.mockResolvedValue(mockTeacherData);
      mockPrisma.user.update.mockResolvedValue({ ...mockTeacherData.user, isActive: false });

      const result = await service.updateTeacherStatus('teacher-1', { isActive: false }, mockAdminUser);

      expect(result.success).toBe(true);
      expect(result.isActive).toBe(false);
      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'DISABLE_TEACHER',
            targetUserId: 'user-teacher-1',
          }),
        }),
      );
    });
  });

  describe('resetTeacherPassword', () => {
    it('should update password and invalidate refresh token hash', async () => {
      mockPrisma.teacher.findUnique.mockResolvedValue(mockTeacherData);
      mockPrisma.user.update.mockResolvedValue(mockTeacherData.user);

      const result = await service.resetTeacherPassword(
        'teacher-1',
        { newPassword: 'NewPassword123@' },
        mockAdminUser,
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-teacher-1' },
        data: expect.objectContaining({
          refreshTokenHash: null,
        }),
      });
      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'RESET_TEACHER_PASSWORD',
          }),
        }),
      );
    });
  });
});
