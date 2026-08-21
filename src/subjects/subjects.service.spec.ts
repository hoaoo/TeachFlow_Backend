import { Test, TestingModule } from '@nestjs/testing';
import { SubjectsService } from './subjects.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('SubjectsService', () => {
  let service: SubjectsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    subject: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubjectsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SubjectsService>(SubjectsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create subject with trimmed uppercase code', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.subject.create.mockResolvedValueOnce({
        id: 'sub-1',
        code: 'TOAN',
        name: 'Toán',
        isActive: true,
        status: 'ACTIVE',
        sortOrder: 1,
      });

      const res = await service.create({
        code: 'toan',
        name: 'Toán',
        sortOrder: 1,
      });

      expect(mockPrismaService.subject.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: 'TOAN',
          name: 'Toán',
          isActive: true,
          status: 'ACTIVE',
        }),
      });
      expect(res.id).toBe('sub-1');
    });

    it('should throw ConflictException if subject code already exists', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValueOnce({
        id: 'existing-sub',
        code: 'TOAN',
      });

      await expect(
        service.create({
          code: 'TOAN',
          name: 'Toán',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should throw ConflictException if subject has referenced lessons or plans', async () => {
      mockPrismaService.subject.findUnique
        .mockResolvedValueOnce({ id: 'sub-1', name: 'Toán' })
        .mockResolvedValueOnce({
          _count: {
            lessons: 10,
            teachingPlans: 2,
            lessonPlans: 3,
            teachingActivities: 0,
            worksheets: 0,
            assessments: 0,
            studentComments: 0,
            teachingResources: 0,
          },
        });

      await expect(service.remove('sub-1')).rejects.toThrow(ConflictException);
    });

    it('should delete subject if no referenced records', async () => {
      mockPrismaService.subject.findUnique
        .mockResolvedValueOnce({ id: 'sub-1', name: 'Toán' })
        .mockResolvedValueOnce({
          _count: {
            lessons: 0,
            teachingPlans: 0,
            lessonPlans: 0,
            teachingActivities: 0,
            worksheets: 0,
            assessments: 0,
            studentComments: 0,
            teachingResources: 0,
          },
        });
      mockPrismaService.subject.delete.mockResolvedValueOnce({ id: 'sub-1' });

      const res = await service.remove('sub-1');
      expect(res.id).toBe('sub-1');
    });
  });
});
