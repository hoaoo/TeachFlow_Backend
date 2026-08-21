import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: PrismaService;

  const mockPrismaService = {
    teacher: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    schoolYear: {
      findFirst: jest.fn(),
    },
    semester: {
      findFirst: jest.fn(),
    },
    classroom: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    studentEnrollment: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    lessonPlan: {
      count: jest.fn(),
    },
    teacherTask: {
      findMany: jest.fn(),
    },
    teachingPlan: {
      findMany: jest.fn(),
    },
    schedule: {
      findMany: jest.fn(),
    },
    attendanceSession: {
      findMany: jest.fn(),
    },
    subject: {
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboardData for TEACHER', () => {
    it('should return complete real data for a teacher with assigned classes', async () => {
      mockPrismaService.schoolYear.findFirst.mockResolvedValue({
        id: 'sy-1',
        name: '2026-2027',
        isCurrent: true,
      });
      mockPrismaService.semester.findFirst.mockResolvedValue({
        id: 'sem-1',
        name: 'Học kỳ 1',
        isActive: true,
        sortOrder: 1,
      });
      mockPrismaService.classroom.findMany.mockResolvedValue([
        {
          id: 'class-1',
          name: '4A',
          teacherId: 'teacher-1',
          room: 'Phòng 204',
          grade: { level: 4, name: 'Khối 4' },
          schoolYear: { name: '2026-2027' },
        },
      ]);
      mockPrismaService.studentEnrollment.findMany.mockResolvedValue([
        {
          id: 'enr-1',
          classroomId: 'class-1',
          status: 'ACTIVE',
          student: {
            id: 'st-1',
            fullName: 'Nguyễn Văn An',
            gender: 'MALE',
            status: 'EXCELLENT',
          },
          classroom: { id: 'class-1', name: '4A' },
        },
        {
          id: 'enr-2',
          classroomId: 'class-1',
          status: 'ACTIVE',
          student: {
            id: 'st-2',
            fullName: 'Trần Thị Bình',
            gender: 'FEMALE',
            status: 'NEEDS_SUPPORT',
          },
          classroom: { id: 'class-1', name: '4A' },
        },
      ]);
      mockPrismaService.lessonPlan.count.mockResolvedValue(8);
      mockPrismaService.teacherTask.findMany.mockResolvedValue([
        { id: 't-1', title: 'Soạn giáo án', dueDate: '2026-08-25', done: true, priority: 'HIGH' },
        { id: 't-2', title: 'Điểm danh', dueDate: '2026-08-22', done: false, priority: 'MEDIUM' },
      ]);
      mockPrismaService.schedule.findMany.mockResolvedValue([
        {
          id: 's-1',
          title: 'Phân số bằng nhau',
          startTime: '07:30',
          room: 'Phòng 204',
          subject: { name: 'Toán' },
          classroom: { name: '4A', room: 'Phòng 204' },
        },
      ]);
      mockPrismaService.attendanceSession.findMany.mockResolvedValue([
        {
          id: 'att-1',
          attendances: [
            { id: 'rec-1', status: 'PRESENT' },
            { id: 'rec-2', status: 'EXCUSED_ABSENCE' },
          ],
        },
      ]);

      const result = await service.getDashboardData({
        userId: 'user-1',
        email: 'teacher@teachflow.vn',
        role: 'TEACHER',
        teacherId: 'teacher-1',
        teacherName: 'Cô Mai',
      });

      expect(result).toBeDefined();
      expect(result.greeting.title).toContain('Cô Mai');
      expect(result.currentSchoolYear?.name).toBe('2026-2027');
      expect(result.currentSemester?.name).toBe('Học kỳ 1');
      expect(result.stats).toHaveLength(4);
      expect(result.stats[0].value).toBe('1'); // 1 class
      expect(result.stats[1].value).toBe('8'); // 8 lesson plans
      expect(result.stats[2].value).toBe('1'); // 1 needs support
      expect(result.stats[3].value).toBe('1/2'); // 1 done of 2 tasks
      expect(result.lessons).toHaveLength(1);
      expect(result.lessons[0].title).toBe('Phân số bằng nhau');
      expect(result.tasks).toHaveLength(2);
      expect(result.classProgress.className).toBe('Lớp 4A');
      expect(result.classProgress.totalStudents).toBe(2);
      expect(result.classProgress.needsSupport).toBe(1);
      expect(result.classProgress.excellent).toBe(1);
      expect(result.classProgress.overallPercent).toBe(50);
      expect(result.featuredStudents).toHaveLength(2);
      expect(result.attendanceRate).toBe(50);
    });

    it('should resolve teacher profile by userId if teacherId is missing', async () => {
      mockPrismaService.teacher.findUnique.mockResolvedValue({
        id: 'resolved-teacher-id',
        fullName: 'Thầy Hùng',
      });
      mockPrismaService.schoolYear.findFirst.mockResolvedValue(null);
      mockPrismaService.semester.findFirst.mockResolvedValue(null);
      mockPrismaService.classroom.findMany.mockResolvedValue([]);
      mockPrismaService.lessonPlan.count.mockResolvedValue(0);
      mockPrismaService.teacherTask.findMany.mockResolvedValue([]);
      mockPrismaService.schedule.findMany.mockResolvedValue([]);

      const result = await service.getDashboardData({
        userId: 'user-2',
        email: 'hung@teachflow.vn',
        role: 'TEACHER',
      });

      expect(mockPrismaService.teacher.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-2' },
        select: { id: true, fullName: true },
      });
      expect(result.greeting.title).toContain('Thầy Hùng');
      expect(result.lessons).toEqual([]);
      expect(result.tasks).toEqual([]);
      expect(result.featuredStudents).toEqual([]);
    });
  });
});
