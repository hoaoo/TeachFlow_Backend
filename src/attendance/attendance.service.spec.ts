import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';
import { AttendanceStatusEnum } from './dto/save-attendance.dto';

describe('AttendanceService (Schedule & Temporal Attendance)', () => {
  let service: AttendanceService;
  let prisma: any;
  let authService: TeachingAssignmentAuthorizationService;

  const mockClass4A1 = {
    id: 'class-4a1',
    name: 'Lớp 4A1',
    teacherId: 'teacher-1',
    deletedAt: null,
    schoolYear: { id: 'sy-1', isActive: true },
  };

  const mockSchedule = {
    id: 'sched-1',
    title: 'Tiết 1: Toán',
    teacherId: 'teacher-1',
    classroomId: 'class-4a1',
    subjectId: 'sub-math',
    plannedDate: new Date('2026-08-24T00:00:00.000Z'),
    startTime: '07:00',
    endTime: '07:45',
    deletedAt: null,
    classroom: mockClass4A1,
    subject: { id: 'sub-math', name: 'Toán' },
  };

  const mockSession = {
    id: 'session-1',
    scheduleId: 'sched-1',
    classroomId: 'class-4a1',
    teacherId: 'teacher-1',
    attendanceDate: new Date('2026-08-24T00:00:00.000Z'),
    note: 'Tiết học sôi nổi',
    status: 'Đã điểm danh',
    attendances: [
      { id: 'att-1', studentId: 'student-1', status: 'PRESENT', lateMinutes: 0, note: null },
      { id: 'att-2', studentId: 'student-2', status: 'LATE', lateMinutes: 5, note: 'Tắc đường' },
      { id: 'att-3', studentId: 'student-3', status: 'UNEXCUSED_ABSENCE', lateMinutes: 0, note: 'Nghỉ không phép' },
    ],
  };

  beforeEach(async () => {
    prisma = {
      classroom: { findUnique: jest.fn(), findFirst: jest.fn() },
      schedule: { findUnique: jest.fn() },
      student: { findUnique: jest.fn() },
      attendanceSession: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn().mockResolvedValue(mockSession),
        update: jest.fn().mockResolvedValue(mockSession),
      },
      studentAttendance: {
        upsert: jest.fn().mockResolvedValue({ id: 'att-1' }),
        findMany: jest.fn().mockResolvedValue(mockSession.attendances),
      },
      studentEnrollment: { findMany: jest.fn(), findFirst: jest.fn() },
      teachingAssignment: { findFirst: jest.fn() },
      $transaction: jest.fn((callback) => {
        if (typeof callback === 'function') {
          return callback({
            attendanceSession: {
              findUnique: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({ id: 'session-new' }),
              update: jest.fn().mockResolvedValue({ id: 'session-updated' }),
              delete: jest.fn().mockResolvedValue({ id: 'session-1' }),
            },
            studentAttendance: {
              upsert: jest.fn().mockResolvedValue({ id: 'att-1' }),
              deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
            },
          });
        }
        return Promise.all(callback);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        {
          provide: PrismaService,
          useValue: prisma,
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
    authService = module.get<TeachingAssignmentAuthorizationService>(TeachingAssignmentAuthorizationService);
  });

  it('gets schedule attendance with student list and status summary', async () => {
    jest.spyOn(prisma.schedule, 'findUnique').mockResolvedValue(mockSchedule as any);
    jest.spyOn(prisma.studentEnrollment, 'findMany').mockResolvedValue([
      { studentId: 'student-1', student: { id: 'student-1', fullName: 'Nguyễn Văn A', gender: 'MALE' } },
      { studentId: 'student-2', student: { id: 'student-2', fullName: 'Trần Thị B', gender: 'FEMALE' } },
      { studentId: 'student-3', student: { id: 'student-3', fullName: 'Lê Văn C', gender: 'MALE' } },
    ] as any);
    jest.spyOn(prisma.attendanceSession, 'findUnique').mockResolvedValue(mockSession as any);

    const result = await service.getScheduleAttendance('sched-1', 'teacher-1');

    expect(result).toBeDefined();
    expect(result.schedule.id).toBe('sched-1');
    expect(result.summary.totalStudents).toBe(3);
    expect(result.summary.presentCount).toBe(1);
    expect(result.summary.lateCount).toBe(1);
    expect(result.summary.unexcusedCount).toBe(1);
    expect(result.isRecorded).toBe(true);
  });

  it('saves schedule attendance in atomic transaction', async () => {
    jest.spyOn(prisma.schedule, 'findUnique').mockResolvedValue(mockSchedule as any);

    const result = await service.saveScheduleAttendance(
      'sched-1',
      {
        note: 'Tiết học tốt',
        attendances: [
          { studentId: 'student-1', status: 'PRESENT' },
          { studentId: 'student-2', status: 'LATE', lateMinutes: 5 },
          { studentId: 'student-3', status: 'ABSENT', note: 'Vắng không phép' },
        ],
      },
      'teacher-1',
    );

    expect(result.success).toBe(true);
    expect(result.summary.presentCount).toBe(1);
    expect(result.summary.lateCount).toBe(1);
    expect(result.summary.unexcusedCount).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rejects saving schedule attendance with duplicate student IDs in payload', async () => {
    jest.spyOn(prisma.schedule, 'findUnique').mockResolvedValue(mockSchedule as any);

    await expect(
      service.saveScheduleAttendance(
        'sched-1',
        {
          attendances: [
            { studentId: 'student-1', status: 'PRESENT' },
            { studentId: 'student-1', status: 'PRESENT' },
          ],
        },
        'teacher-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects unauthorized teacher accessing another teacher schedule', async () => {
    jest.spyOn(prisma.schedule, 'findUnique').mockResolvedValue(mockSchedule as any);
    jest.spyOn(authService, 'assertTeacherCanAccessClassroomAttendance').mockRejectedValue(
      new ForbiddenException('Bạn không có quyền truy cập'),
    );

    await expect(
      service.getScheduleAttendance('sched-1', 'teacher-intruder'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('gets student attendance summary and calculates attendance rate', async () => {
    jest.spyOn(prisma.student, 'findUnique').mockResolvedValue({
      id: 'student-1',
      fullName: 'Nguyễn Văn A',
      deletedAt: null,
      studentEnrollments: [{ classroom: { name: 'Lớp 4A1' } }],
    } as any);

    jest.spyOn(prisma.studentAttendance, 'findMany').mockResolvedValue([
      {
        id: 'att-1',
        status: 'PRESENT',
        lateMinutes: 0,
        attendanceSession: {
          attendanceDate: new Date('2026-08-24'),
          schedule: { subject: { name: 'Toán' }, startTime: '07:00', endTime: '07:45' },
        },
      },
      {
        id: 'att-2',
        status: 'LATE',
        lateMinutes: 10,
        attendanceSession: {
          attendanceDate: new Date('2026-08-23'),
          schedule: { subject: { name: 'Tiếng Việt' }, startTime: '08:00', endTime: '08:45' },
        },
      },
      {
        id: 'att-3',
        status: 'UNEXCUSED_ABSENCE',
        lateMinutes: 0,
        attendanceSession: {
          attendanceDate: new Date('2026-08-22'),
          schedule: { subject: { name: 'Khoa học' }, startTime: '09:00', endTime: '09:45' },
        },
      },
    ] as any);

    const summary = await service.getStudentAttendanceSummary('student-1', 'teacher-1');

    expect(summary).toBeDefined();
    expect(summary.summary.totalPeriods).toBe(3);
    expect(summary.summary.presentCount).toBe(1);
    expect(summary.summary.lateCount).toBe(1);
    expect(summary.summary.unexcusedCount).toBe(1);
    expect(summary.summary.attendanceRate).toBe(67);
  });

  it('gets attendance session details with student list', async () => {
    jest.spyOn(prisma.attendanceSession, 'findUnique').mockResolvedValue({
      ...mockSession,
      classroom: mockClass4A1,
      schedule: mockSchedule,
    } as any);
    jest.spyOn(prisma.studentEnrollment, 'findMany').mockResolvedValue([
      { studentId: 'student-1', student: { id: 'student-1', fullName: 'Nguyễn Văn A', studentCode: 'HS01', gender: 'MALE' } },
      { studentId: 'student-2', student: { id: 'student-2', fullName: 'Trần Thị B', studentCode: 'HS02', gender: 'FEMALE' } },
      { studentId: 'student-3', student: { id: 'student-3', fullName: 'Lê Văn C', studentCode: 'HS03', gender: 'MALE' } },
    ] as any);

    const result = await service.getSessionAttendance('session-1', 'teacher-1');

    expect(result).toBeDefined();
    expect(result.sessionId).toBe('session-1');
    expect(result.students.length).toBe(3);
    expect(result.summary.presentCount).toBe(1);
    expect(result.summary.lateCount).toBe(1);
    expect(result.summary.unexcusedCount).toBe(1);
  });

  it('updates session attendance in atomic transaction', async () => {
    jest.spyOn(prisma.attendanceSession, 'findUnique').mockResolvedValue({
      ...mockSession,
      classroom: mockClass4A1,
    } as any);

    const result = await service.updateSessionAttendance(
      'session-1',
      {
        title: 'Điểm danh buổi sáng cập nhật',
        note: 'Cập nhật lý do vắng',
        attendances: [
          { studentId: 'student-1', status: 'PRESENT' },
          { studentId: 'student-2', status: 'PRESENT' },
          { studentId: 'student-3', status: 'EXCUSED_ABSENCE', note: 'Có đơn xin phép' },
        ],
      },
      'teacher-1',
    );

    expect(result.success).toBe(true);
    expect(result.summary.presentCount).toBe(2);
    expect(result.summary.excusedCount).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('deletes session attendance in atomic transaction', async () => {
    jest.spyOn(prisma.attendanceSession, 'findUnique').mockResolvedValue({
      ...mockSession,
      classroom: mockClass4A1,
    } as any);

    const result = await service.deleteSessionAttendance('session-1', 'teacher-1');

    expect(result.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
