import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClassroomsService } from './classrooms.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ClassroomsService (Authorization & Scope)', () => {
  let service: ClassroomsService;
  let prisma: PrismaService;

  const mockClassroomA = {
    id: 'class-a',
    name: 'Lớp 4A',
    teacherId: 'teacher-a',
    deletedAt: null,
    grade: { name: 'Khối 4' },
    teacher: { fullName: 'Cô Nguyễn Hà' },
    classStudents: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassroomsService,
        {
          provide: PrismaService,
          useValue: {
            classroom: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            grade: { findFirst: jest.fn(), create: jest.fn() },
            schoolYear: { findFirst: jest.fn(), create: jest.fn() },
            classStudent: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<ClassroomsService>(ClassroomsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('Teacher A can access their own classroom', async () => {
    jest.spyOn(prisma.classroom, 'findUnique').mockResolvedValue(mockClassroomA as any);

    const result = await service.findOne('class-a', 'teacher-a');
    expect(result).toBeDefined();
    expect(result.id).toBe('class-a');
  });

  it('Teacher B is FORBIDDEN from accessing Teacher A classroom', async () => {
    jest.spyOn(prisma.classroom, 'findUnique').mockResolvedValue(mockClassroomA as any);

    await expect(
      service.findOne('class-a', 'teacher-b'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('Throws NotFoundException if class is soft-deleted', async () => {
    jest.spyOn(prisma.classroom, 'findUnique').mockResolvedValue({
      ...mockClassroomA,
      deletedAt: new Date(),
    } as any);

    await expect(
      service.findOne('class-a', 'teacher-a'),
    ).rejects.toThrow(NotFoundException);
  });
});
