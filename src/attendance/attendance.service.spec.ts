import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceStatusEnum } from './dto/save-attendance.dto';

describe('AttendanceService (Atomic Transaction & Validation)', () => {
  let service: AttendanceService;
  let prisma: PrismaService;

  const mockClass = {
    id: 'class-4a',
    name: 'Lớp 4A',
    teacherId: 'teacher-1',
    deletedAt: null,
    classStudents: [
      { studentId: 'student-1' },
      { studentId: 'student-2' },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        {
          provide: PrismaService,
          useValue: {
            classroom: { findUnique: jest.fn(), findFirst: jest.fn() },
            attendanceSession: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
            studentAttendance: { upsert: jest.fn(), findMany: jest.fn() },
            $transaction: jest.fn((callback) => callback({
              attendanceSession: {
                findUnique: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({ id: 'session-new' }),
                update: jest.fn(),
              },
              studentAttendance: {
                upsert: jest.fn().mockResolvedValue({ id: 'att-1' }),
              },
            })),
          },
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('rejects student that does not belong to the class', async () => {
    jest.spyOn(prisma.classroom, 'findUnique').mockResolvedValue(mockClass as any);

    await expect(
      service.saveAttendance(
        {
          classId: 'class-4a',
          date: '2026-08-20',
          attendances: [
            { studentId: 'student-999_NOT_IN_CLASS', status: AttendanceStatusEnum.PRESENT },
          ],
        },
        'teacher-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects when teacher does not own the class', async () => {
    jest.spyOn(prisma.classroom, 'findUnique').mockResolvedValue(mockClass as any);

    await expect(
      service.saveAttendance(
        {
          classId: 'class-4a',
          date: '2026-08-20',
          attendances: [{ studentId: 'student-1', status: AttendanceStatusEnum.PRESENT }],
        },
        'other-teacher',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('saves attendance in atomic transaction when valid', async () => {
    jest.spyOn(prisma.classroom, 'findUnique').mockResolvedValue(mockClass as any);

    const result = await service.saveAttendance(
      {
        classId: 'class-4a',
        date: '2026-08-20',
        attendances: [
          { studentId: 'student-1', status: AttendanceStatusEnum.PRESENT },
          { studentId: 'student-2', status: AttendanceStatusEnum.LATE, note: 'Muộn 5p' },
        ],
      },
      'teacher-1',
    );

    expect(result.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
