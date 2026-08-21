import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    teacher: {
      findUnique: jest.fn(),
    },
    classroom: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    attendanceSession: {
      findMany: jest.fn(),
    },
    assessment: {
      findMany: jest.fn(),
    },
    teachingAssignment: {
      findMany: jest.fn(),
    },
    studentEnrollment: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Attendance Report', () => {
    it('should aggregate attendance statistics accurately', async () => {
      mockPrismaService.attendanceSession.findMany.mockResolvedValue([
        {
          id: 'sess-1',
          attendanceDate: new Date('2026-08-20'),
          classroom: { id: 'c-1', name: '4A', grade: { name: 'Khối 4' } },
          attendances: [
            { studentId: 's1', status: 'PRESENT', student: { id: 's1', fullName: 'An', gender: 'MALE' } },
            { studentId: 's2', status: 'EXCUSED_ABSENCE', student: { id: 's2', fullName: 'Bình', gender: 'FEMALE' } },
            { studentId: 's3', status: 'UNEXCUSED_ABSENCE', student: { id: 's3', fullName: 'Cường', gender: 'MALE' } },
            { studentId: 's4', status: 'LATE', student: { id: 's4', fullName: 'Dũng', gender: 'MALE' } },
          ],
        },
      ]);

      const result = await service.getAttendanceReport({}, {
        userId: 'admin-1',
        email: 'admin@teachflow.vn',
        role: 'ADMIN',
      });

      expect(result.summary.totalSessions).toBe(1);
      expect(result.summary.totalRecords).toBe(4);
      expect(result.summary.presentCount).toBe(1);
      expect(result.summary.excusedCount).toBe(1);
      expect(result.summary.unexcusedCount).toBe(1);
      expect(result.summary.lateCount).toBe(1);
      expect(result.summary.attendanceRate).toBe(25);
      expect(result.studentsWithAbsences).toHaveLength(3);
    });

    it('should generate CSV with UTF-8 BOM', async () => {
      mockPrismaService.attendanceSession.findMany.mockResolvedValue([]);

      const csv = await service.exportAttendanceReportCsv({}, {
        userId: 'admin-1',
        email: 'admin@teachflow.vn',
        role: 'ADMIN',
      });

      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toContain('BÁO CÁO CHUYÊN CẦN');
    });
  });

  describe('Assessment Report', () => {
    it('should aggregate assessment levels and rates', async () => {
      mockPrismaService.assessment.findMany.mockResolvedValue([
        {
          id: 'asm-1',
          title: 'Kiểm tra 15 phút Toán',
          status: 'COMPLETED',
          classroom: { id: 'c-1', name: '4A' },
          subject: { id: 'sub-1', name: 'Toán' },
          createdAt: new Date('2026-08-20'),
          studentAssessments: [
            { level: 'EXCELLENT', student: { fullName: 'An' } },
            { level: 'COMPLETED', student: { fullName: 'Bình' } },
            { level: 'NEEDS_SUPPORT', student: { fullName: 'Cường' } },
            { level: 'EXCELLENT', student: { fullName: 'Dũng' } },
          ],
        },
      ]);

      const result = await service.getAssessmentReport({}, {
        userId: 'admin-1',
        email: 'admin@teachflow.vn',
        role: 'ADMIN',
      });

      expect(result.summary.totalAssessments).toBe(1);
      expect(result.summary.totalStudentAssessments).toBe(4);
      expect(result.summary.excellentCount).toBe(2);
      expect(result.summary.completedCount).toBe(1);
      expect(result.summary.needsSupportCount).toBe(1);
      expect(result.summary.excellentRate).toBe(50);
      expect(result.summary.completedRate).toBe(25);
      expect(result.summary.needsSupportRate).toBe(25);
    });
  });

  describe('Classroom Summary Report & IDOR', () => {
    it('should reject non-admin teacher who does not teach the classroom', async () => {
      mockPrismaService.teacher.findUnique.mockResolvedValue({ id: 'teacher-other' });
      mockPrismaService.classroom.findFirst.mockResolvedValue(null);

      await expect(
        service.getClassroomSummaryReport('c-unauthorized', {
          userId: 'user-other',
          email: 'other@teachflow.vn',
          role: 'TEACHER',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return complete classroom summary for authorized teacher', async () => {
      mockPrismaService.classroom.findFirst.mockResolvedValue({ id: 'c-1' });
      mockPrismaService.classroom.findUnique.mockResolvedValue({
        id: 'c-1',
        name: '4A',
        code: '4A-2026',
        room: 'Phòng 204',
        grade: { name: 'Khối 4' },
        schoolYear: { name: '2026-2027' },
        teacher: { fullName: 'Cô Mai', phone: '0912345678' },
        studentEnrollments: [
          {
            student: { id: 's1', studentCode: 'HS001', fullName: 'Nguyễn Văn An', gender: 'MALE', status: 'EXCELLENT', dateOfBirth: new Date('2015-05-12') },
          },
          {
            student: { id: 's2', studentCode: 'HS002', fullName: 'Trần Thị Bình', gender: 'FEMALE', status: 'GOOD', dateOfBirth: new Date('2015-08-20') },
          },
        ],
        attendanceSessions: [],
        studentBehaviorRecords: [
          { id: 'b1', level: 'POSITIVE', category: 'LEARNING', content: 'Chăm phát biểu', recordDate: new Date(), student: { fullName: 'An' } },
        ],
      });

      const result = await service.getClassroomSummaryReport('c-1', {
        userId: 'user-1',
        email: 'mai@teachflow.vn',
        role: 'TEACHER',
        teacherId: 'teacher-mai',
      });

      expect(result.classInfo.name).toBe('4A');
      expect(result.students.total).toBe(2);
      expect(result.students.male).toBe(1);
      expect(result.students.female).toBe(1);
      expect(result.behavior.positive).toBe(1);
    });
  });

  describe('Teaching Assignments Report', () => {
    it('should aggregate teaching assignments by teacher', async () => {
      mockPrismaService.teachingAssignment.findMany.mockResolvedValue([
        {
          id: 'ta-1',
          teacherId: 't-1',
          teacher: { id: 't-1', fullName: 'Thầy Hùng', phone: '0987654321' },
          classroom: { name: '4A', grade: { name: 'Khối 4' } },
          subject: { name: 'Toán', code: 'MATH' },
          schoolYear: { name: '2026-2027' },
        },
      ]);

      const result = await service.getTeachingAssignmentsReport({}, {
        userId: 'admin-1',
        email: 'admin@teachflow.vn',
        role: 'ADMIN',
      });

      expect(result.totalAssignments).toBe(1);
      expect(result.totalTeachers).toBe(1);
      expect(result.byTeacher[0].teacherName).toBe('Thầy Hùng');
      expect(result.byTeacher[0].assignments).toHaveLength(1);
    });
  });

  describe('Student Enrollment Report', () => {
    it('should aggregate enrollment statistics by class', async () => {
      mockPrismaService.studentEnrollment.findMany.mockResolvedValue([
        {
          id: 'enr-1',
          classroomId: 'c-1',
          status: 'ACTIVE',
          enrolledAt: new Date('2026-08-01'),
          student: { id: 's1', fullName: 'An', studentCode: 'HS1', gender: 'MALE' },
          classroom: { name: '4A', grade: { name: 'Khối 4' } },
        },
        {
          id: 'enr-2',
          classroomId: 'c-1',
          status: 'TRANSFERRED',
          enrolledAt: new Date('2026-08-01'),
          student: { id: 's2', fullName: 'Bình', studentCode: 'HS2', gender: 'FEMALE' },
          classroom: { name: '4A', grade: { name: 'Khối 4' } },
        },
      ]);

      const result = await service.getStudentEnrollmentReport({}, {
        userId: 'admin-1',
        email: 'admin@teachflow.vn',
        role: 'ADMIN',
      });

      expect(result.totalEnrollments).toBe(2);
      expect(result.activeEnrollments).toBe(1);
      expect(result.classBreakdown[0].active).toBe(1);
      expect(result.classBreakdown[0].transferred).toBe(1);
    });
  });
});
