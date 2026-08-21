import { Test, TestingModule } from '@nestjs/testing';
import { SchoolYearsService } from './school-years.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('SchoolYearsService', () => {
  let service: SchoolYearsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    schoolYear: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchoolYearsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SchoolYearsService>(SchoolYearsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should throw BadRequestException if startDate >= endDate', async () => {
      await expect(
        service.create({
          name: '2026 - 2027',
          startDate: '2027-09-01',
          endDate: '2026-05-31',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if school year name already exists', async () => {
      mockPrismaService.schoolYear.findUnique.mockResolvedValueOnce({
        id: 'existing-id',
        name: '2026 - 2027',
      });

      await expect(
        service.create({
          name: '2026 - 2027',
          startDate: '2026-09-01',
          endDate: '2027-05-31',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should unset other current school years in transaction when isCurrent is true', async () => {
      mockPrismaService.schoolYear.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.schoolYear.create.mockResolvedValueOnce({
        id: 'new-id',
        name: '2026 - 2027',
        isCurrent: true,
      });

      const result = await service.create({
        name: '2026 - 2027',
        startDate: '2026-09-01',
        endDate: '2027-05-31',
        isCurrent: true,
      });

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockPrismaService.schoolYear.updateMany).toHaveBeenCalledWith({
        where: { isCurrent: true },
        data: { isCurrent: false },
      });
      expect(result.id).toBe('new-id');
    });
  });

  describe('setCurrent', () => {
    it('should unset other currents and set target school year to current in transaction', async () => {
      mockPrismaService.schoolYear.findUnique.mockResolvedValueOnce({
        id: 'target-id',
        name: '2026 - 2027',
      });
      mockPrismaService.schoolYear.update.mockResolvedValueOnce({
        id: 'target-id',
        name: '2026 - 2027',
        isCurrent: true,
      });

      const result = await service.setCurrent('target-id');

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockPrismaService.schoolYear.updateMany).toHaveBeenCalledWith({
        where: { isCurrent: true, id: { not: 'target-id' } },
        data: { isCurrent: false },
      });
      expect(result.id).toBe('target-id');
    });
  });
});
