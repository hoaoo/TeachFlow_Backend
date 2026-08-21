import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: PrismaService;

  const mockPrismaService = {
    adminAuditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log()', () => {
    it('should sanitize sensitive keys (passwords, tokens) before saving', async () => {
      mockPrismaService.adminAuditLog.create.mockResolvedValue({ id: 'log-1' });

      await service.log({
        actorUserId: 'u-1',
        actorEmail: 'admin@teachflow.vn',
        action: 'TEST_ACTION',
        details: {
          username: 'teacher1',
          password: 'SecretPassword123!',
          refreshToken: 'secret-refresh-token',
          nested: {
            apiKey: 'sk-12345678',
            safeField: 'hello',
          },
        },
      });

      expect(mockPrismaService.adminAuditLog.create).toHaveBeenCalledTimes(1);
      const callArg = mockPrismaService.adminAuditLog.create.mock.calls[0][0];

      expect(callArg.data.action).toBe('TEST_ACTION');
      expect(callArg.data.actorEmail).toBe('admin@teachflow.vn');

      const parsedDetails = JSON.parse(callArg.data.details);
      expect(parsedDetails.password).toBe('[REDACTED]');
      expect(parsedDetails.refreshToken).toBe('[REDACTED]');
      expect(parsedDetails.nested.apiKey).toBe('[REDACTED]');
      expect(parsedDetails.nested.safeField).toBe('hello');
    });

    it('should never throw error even if database creation fails', async () => {
      mockPrismaService.adminAuditLog.create.mockRejectedValue(new Error('DB connection dead'));

      await expect(
        service.log({
          action: 'FAIL_ACTION',
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('listLogs()', () => {
    it('should return paginated audit logs with metadata', async () => {
      mockPrismaService.adminAuditLog.count.mockResolvedValue(25);
      mockPrismaService.adminAuditLog.findMany.mockResolvedValue([
        { id: 'l1', action: 'AUTH_LOGIN', actorEmail: 'admin@teachflow.vn', createdAt: new Date() },
      ]);

      const result = await service.listLogs({
        page: 1,
        pageSize: 10,
        action: 'AUTH_LOGIN',
      });

      expect(result.items).toHaveLength(1);
      expect(result.totalItems).toBe(25);
      expect(result.totalPages).toBe(3);
      expect(result.page).toBe(1);
    });
  });
});
