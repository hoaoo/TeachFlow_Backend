import { Test, TestingModule } from '@nestjs/testing';
import { SemestersService } from './semesters.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('SemestersService', () => {
  let service: SemestersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    schoolYear: {
      findUnique: jest.fn(),
    },
    semester: {
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
        SemestersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SemestersService>(SemestersService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should throw NotFoundException if school year does not exist', async () => {
      mockPrismaService.schoolYear.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.create({
          schoolYearId: 'non-existent-sy',
          code: 'HK1',
          name: 'Học kỳ I',
          startDate: '2026-09-01',
          endDate: '2027-01-15',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if semester dates exceed school year boundaries', async () => {
      mockPrismaService.schoolYear.findUnique.mockResolvedValueOnce({
        id: 'sy-1',
        name: '2026 - 2027',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-05-31'),
      });

      // startDate before school year
      await expect(
        service.create({
          schoolYearId: 'sy-1',
          code: 'HK1',
          name: 'Học kỳ I',
          startDate: '2026-08-15',
          endDate: '2027-01-15',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if semester code is duplicated in the same school year', async () => {
      mockPrismaService.schoolYear.findUnique.mockResolvedValueOnce({
        id: 'sy-1',
        name: '2026 - 2027',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-05-31'),
      });
      mockPrismaService.semester.findUnique.mockResolvedValueOnce({
        id: 'sem-existing',
        code: 'HK1',
      });

      await expect(
        service.create({
          schoolYearId: 'sy-1',
          code: 'HK1',
          name: 'Học kỳ I',
          startDate: '2026-09-01',
          endDate: '2027-01-15',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully create semester when all validations pass', async () => {
      mockPrismaService.schoolYear.findUnique.mockResolvedValueOnce({
        id: 'sy-1',
        name: '2026 - 2027',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-05-31'),
      });
      mockPrismaService.semester.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.semester.create.mockResolvedValueOnce({
        id: 'sem-1',
        schoolYearId: 'sy-1',
        code: 'HK1',
        name: 'Học kỳ I',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-01-15'),
      });

      const res = await service.create({
        schoolYearId: 'sy-1',
        code: 'hk1',
        name: 'Học kỳ I',
        startDate: '2026-09-01',
        endDate: '2027-01-15',
      });

      expect(res.id).toBe('sem-1');
      expect(mockPrismaService.semester.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: 'HK1',
          name: 'Học kỳ I',
        }),
        include: { schoolYear: true },
      });
    });
  });
});
