import { Test, TestingModule } from '@nestjs/testing';
import { GradesService } from './grades.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('GradesService', () => {
  let service: GradesService;
  let prisma: PrismaService;

  const mockPrismaService = {
    grade: {
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
        GradesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<GradesService>(GradesService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should generate default code if not provided', async () => {
      mockPrismaService.grade.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.grade.create.mockResolvedValueOnce({
        id: 'grade-1',
        code: 'K01',
        name: 'Khối 1',
        level: 1,
      });

      const res = await service.create({
        name: 'Khối 1',
        level: 1,
      });

      expect(mockPrismaService.grade.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: 'K01',
          name: 'Khối 1',
          level: 1,
        }),
      });
      expect(res.id).toBe('grade-1');
    });

    it('should throw ConflictException if grade code is duplicated', async () => {
      mockPrismaService.grade.findUnique.mockResolvedValueOnce({
        id: 'existing-id',
        code: 'K04',
      });

      await expect(
        service.create({
          code: 'K04',
          name: 'Khối 4',
          level: 4,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should throw ConflictException if grade is referenced by classrooms or other entities', async () => {
      mockPrismaService.grade.findUnique
        .mockResolvedValueOnce({ id: 'g-1', name: 'Khối 4' })
        .mockResolvedValueOnce({
          _count: {
            classrooms: 5,
            lessons: 0,
            teachingActivities: 0,
            worksheets: 0,
            teachingResources: 0,
          },
        });

      await expect(service.remove('g-1')).rejects.toThrow(ConflictException);
    });

    it('should delete grade if not referenced', async () => {
      mockPrismaService.grade.findUnique
        .mockResolvedValueOnce({ id: 'g-1', name: 'Khối 4' })
        .mockResolvedValueOnce({
          _count: {
            classrooms: 0,
            lessons: 0,
            teachingActivities: 0,
            worksheets: 0,
            teachingResources: 0,
          },
        });
      mockPrismaService.grade.delete.mockResolvedValueOnce({ id: 'g-1' });

      const res = await service.remove('g-1');
      expect(res.id).toBe('g-1');
    });
  });
});
