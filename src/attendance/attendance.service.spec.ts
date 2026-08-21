import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';
import { AttendanceStatusEnum } from './dto/save-attendance.dto';

describe('AttendanceService (Phase 5 - Temporal Enrollment & Authorization)', () => {
  let service: AttendanceService;
  let prisma: PrismaService;
  let authService: TeachingAssignmentAuthorizationService;

  const mockClass4A1 = {
    id: 'class-4a1',
    name: 'Lớp 4A1',
    teacherId: 'teacher-1',
    deletedAt: null,
  };

  const mockClass4A2 = {
    id: 'class-4a2',
    name: 'Lớp 4A2',
    teacherId: 'teacher-2',
    deletedAt: null,
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
            studentEnrollment: { findMany: jest.fn(), findFirst: jest.fn() },
            teachingAssignment: { findFirst: jest.fn() },
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
        {
          provide: TeachingAssignmentAuthorizationService,
          useValue: {
            assertTeacherCanAccessClassroomAttendance: jest.fn(),
            assertStudentsEnrolled: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
    prisma = module.get<PrismaService>(PrismaService);
    authService = module.get<TeachingAssignmentAuthorizationService>(TeachingAssignmentAuthorizationService);
  });

  it('allows teacher to get attendance of assigned classroom', async () => {
    jest.spyOn(prisma.classroom, 'findUnique').mockResolvedValue(mockClass4A1 as any);
    jest.spyOn(prisma.studentEnrollment, 'findMany').mockResolvedValue([
      { studentId: 'student-1', student: { id: 'student-1', fullName: 'Nguyễn Văn A', gender: 'MALE' } },
    ] as any);
    jest.spyOn(prisma.attendanceSession, 'findUnique').mockResolvedValue(null);

    const result = await service.getAttendance('class-4a1', '2026-11-10', 'teacher-1');

    expect(authService.assertTeacherCanAccessClassroomAttendance).toHaveBeenCalledWith('class-4a1', 'teacher-1');
    expect(result).toBeDefined();
    expect(result.totalStudents).toBe(1);
    expect(result.students[0].name).toBe('Nguyễn Văn A');
  });

  it('rejects teacher attempting to get attendance of unauthorized class (IDOR)', async () => {
    jest.spyOn(prisma.classroom, 'findUnique').mockResolvedValue(mockClass4A1 as any);
    jest.spyOn(authService, 'assertTeacherCanAccessClassroomAttendance').mockRejectedValue(
      new ForbiddenException('Bạn không có quyền quản lý điểm danh của lớp học này'),
    );

    await expect(service.getAttendance('class-4a1', '2026-11-10', 'teacher-intruder')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('correctly handles historical temporal enrollment for transferred student', async () => {
    // Scenario: Student A was in 4A1 until Nov 15, then transferred to 4A2 from Nov 16
    const studentA = { id: 'student-A', fullName: 'Trần Thị B', gender: 'FEMALE' };

    // Nov 10 for 4A1 -> Student A included
    jest.spyOn(prisma.classroom, 'findUnique').mockResolvedValue(mockClass4A1 as any);
    jest.spyOn(prisma.studentEnrollment, 'findMany').mockResolvedValue([
      { studentId: 'student-A', student: studentA },
    ] as any);
    jest.spyOn(prisma.attendanceSession, 'findUnique').mockResolvedValue(null);

    const result4A1_Nov10 = await service.getAttendance('class-4a1', '2026-11-10', 'teacher-1');
    expect(result4A1_Nov10.students.some((s) => s.studentId === 'student-A')).toBe(true);

    // Nov 20 for 4A1 -> Student A excluded
    jest.spyOn(prisma.studentEnrollment, 'findMany').mockResolvedValue([]);
    const result4A1_Nov20 = await service.getAttendance('class-4a1', '2026-11-20', 'teacher-1');
    expect(result4A1_Nov20.students.some((s) => s.studentId === 'student-A')).toBe(false);

    // Nov 20 for 4A2 -> Student A included
    jest.spyOn(prisma.classroom, 'findUnique').mockResolvedValue(mockClass4A2 as any);
    jest.spyOn(prisma.studentEnrollment, 'findMany').mockResolvedValue([
      { studentId: 'student-A', student: studentA },
    ] as any);
    const result4A2_Nov20 = await service.getAttendance('class-4a2', '2026-11-20', 'teacher-2');
    expect(result4A2_Nov20.students.some((s) => s.studentId === 'student-A')).toBe(true);
  });

  it('rejects saving attendance when a student is not enrolled on attendance date (Cross-Class Student IDOR)', async () => {
    jest.spyOn(prisma.classroom, 'findUnique').mockResolvedValue(mockClass4A1 as any);
    jest.spyOn(authService, 'assertStudentsEnrolled').mockRejectedValue(
      new BadRequestException('Học sinh với mã student-999 không thuộc danh sách lớp học'),
    );

    await expect(
      service.saveAttendance(
        {
          classId: 'class-4a1',
          date: '2026-08-20',
          attendances: [{ studentId: 'student-999', status: AttendanceStatusEnum.PRESENT }],
        },
        'teacher-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('saves attendance in atomic transaction when valid', async () => {
    jest.spyOn(prisma.classroom, 'findUnique').mockResolvedValue(mockClass4A1 as any);
    jest.spyOn(prisma.teachingAssignment, 'findFirst').mockResolvedValue({ id: 'asg-1' } as any);

    const result = await service.saveAttendance(
      {
        classId: 'class-4a1',
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
