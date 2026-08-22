import { Test, TestingModule } from '@nestjs/testing';
import { StudentsService } from './students.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';
import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';

describe('StudentsService (Production Unit Tests)', () => {
  let service: StudentsService;
  let mockPrisma: any;
  let mockAudit: any;

  const mockTeacherA = { id: 'teacher-a', fullName: 'Cô Lan' };
  const mockTeacherB = { id: 'teacher-b', fullName: 'Thầy Hùng' };

  const mockClass1G = {
    id: 'class-1g',
    name: 'Lớp 1G',
    code: '1G',
    schoolYearId: 'sy-2026',
    gradeId: 'grade-1',
    teacherId: 'teacher-a',
    deletedAt: null,
    grade: { id: 'grade-1', name: 'Khối 1' },
    schoolYear: { id: 'sy-2026', name: '2026 - 2027', isCurrent: true },
  };

  const mockClass1A = {
    id: 'class-1a',
    name: 'Lớp 1A',
    code: '1A',
    schoolYearId: 'sy-2026',
    gradeId: 'grade-1',
    teacherId: 'teacher-a',
    deletedAt: null,
    grade: { id: 'grade-1', name: 'Khối 1' },
    schoolYear: { id: 'sy-2026', name: '2026 - 2027', isCurrent: true },
  };

  const mockStudent1 = {
    id: 'student-1',
    studentCode: 'HS001',
    fullName: 'Nguyễn Văn A',
    initials: 'NA',
    gender: 'MALE',
    dobString: '12/04/2016',
    parentName: 'Nguyễn Thị Hoa',
    parentPhone: '0901234567',
    avatarColor: 'bg-teal-100 text-teal-700',
    status: 'EXCELLENT',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    classStudents: [
      {
        id: 'cs-1',
        classroomId: 'class-1g',
        studentId: 'student-1',
        status: 'ACTIVE',
        classroom: mockClass1G,
      },
    ],
    studentEnrollments: [
      {
        id: 'se-1',
        studentId: 'student-1',
        schoolYearId: 'sy-2026',
        classroomId: 'class-1g',
        status: 'ACTIVE',
        enrolledAt: new Date(),
        classroom: mockClass1G,
        schoolYear: { id: 'sy-2026', name: '2026 - 2027', isCurrent: true },
      },
    ],
    comments: [
      {
        id: 'c-1',
        content: 'Chăm chỉ phát biểu',
        commentDate: new Date(),
        teacher: mockTeacherA,
      },
    ],
    studentAttendances: [
      {
        id: 'sa-1',
        status: 'PRESENT',
        lateMinutes: 0,
        createdAt: new Date(),
        attendanceSession: {
          id: 'sess-1',
          attendanceDate: new Date(),
          teacher: mockTeacherA,
          schedule: { id: 'sch-1', startTime: '07:00', endTime: '07:45', subject: { name: 'Toán' } },
        },
      },
    ],
    studentAssessments: [
      {
        id: 's-ass-1',
        score: 9.5,
        level: 'EXCELLENT',
        createdAt: new Date(),
        assessment: { id: 'ass-1', title: 'Kiểm tra giữa kỳ', subject: { name: 'Toán' }, classroom: mockClass1G },
        criterion: { id: 'crit-1', name: 'Hiểu bài tốt' },
      },
    ],
  };

  beforeEach(async () => {
    mockPrisma = {
      student: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      classroom: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      teachingAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      classStudent: {
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
      studentEnrollment: {
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      studentAttendance: {
        findMany: jest.fn(),
      },
      studentAssessment: {
        findMany: jest.fn(),
      },
      studentComment: {
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(mockPrisma)),
    };

    mockAudit = {
      log: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsService,
        TeachingAssignmentAuthorizationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<StudentsService>(StudentsService);
  });

  describe('findAll (Scoped by Teacher & Zero-data)', () => {
    it('returns empty list if teacher has no classrooms', async () => {
      mockPrisma.classroom.findMany.mockResolvedValueOnce([]);
      mockPrisma.teachingAssignment.findMany.mockResolvedValueOnce([]);

      const res = await service.findAll({}, 'teacher-no-class');
      expect(res.items).toHaveLength(0);
      expect(res.summary.totalStudents).toBe(0);
      expect(res.summary.avgAttendanceRate).toBeNull();
    });

    it('returns students scoped by teacher with calculated summary stats', async () => {
      mockPrisma.classroom.findMany.mockResolvedValueOnce([mockClass1G]);
      mockPrisma.teachingAssignment.findMany.mockResolvedValueOnce([]);

      mockPrisma.student.count.mockResolvedValueOnce(1);
      mockPrisma.student.findMany
        .mockResolvedValueOnce([mockStudent1]) // for paged items
        .mockResolvedValueOnce([
          {
            id: 'student-1',
            status: 'EXCELLENT',
            studentAttendances: [{ status: 'PRESENT' }],
          },
        ]); // for summary aggregation

      const res = await service.findAll({}, 'teacher-a');
      expect(res.items).toHaveLength(1);
      expect(res.items[0].name).toBe('Nguyễn Văn A');
      expect(res.items[0].studentCode).toBe('HS001');
      expect(res.summary.totalStudents).toBe(1);
      expect(res.summary.avgAttendanceRate).toBe(100);
    });

    it('returns avgAttendanceRate = null if no attendance records exist for teacher students', async () => {
      mockPrisma.classroom.findMany.mockResolvedValueOnce([mockClass1G]);
      mockPrisma.teachingAssignment.findMany.mockResolvedValueOnce([]);

      mockPrisma.student.count.mockResolvedValueOnce(1);
      mockPrisma.student.findMany
        .mockResolvedValueOnce([
          {
            ...mockStudent1,
            studentAttendances: [],
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'student-1',
            status: 'EXCELLENT',
            studentAttendances: [],
          },
        ]);

      const res = await service.findAll({}, 'teacher-a');
      expect(res.summary.avgAttendanceRate).toBeNull();
      expect(res.items[0].attendance).toBeNull();
    });

    it('filters by classroomId and handles ALL / Tất cả correctly without zeroing list', async () => {
      mockPrisma.classroom.findMany.mockResolvedValue([mockClass1G, mockClass1A]);
      mockPrisma.teachingAssignment.findMany.mockResolvedValue([]);

      mockPrisma.student.count.mockResolvedValue(1);
      mockPrisma.student.findMany
        .mockResolvedValueOnce([mockStudent1])
        .mockResolvedValueOnce([{ id: 'student-1', status: 'EXCELLENT', studentAttendances: [] }]);

      const resAll = await service.findAll({ classId: 'ALL', gradeId: 'ALL', status: 'ALL' }, 'teacher-a');
      expect(resAll.items).toHaveLength(1);

      mockPrisma.student.findMany
        .mockResolvedValueOnce([mockStudent1])
        .mockResolvedValueOnce([{ id: 'student-1', status: 'EXCELLENT', studentAttendances: [] }]);

      const resFiltered = await service.findAll({ classId: 'class-1g', gradeId: 'grade-1', status: 'Tốt' }, 'teacher-a');
      expect(resFiltered.items).toHaveLength(1);
    });

    it('deduplicates students having multiple historical enrollments and returns unique record', async () => {
      mockPrisma.classroom.findMany.mockResolvedValue([mockClass1G, mockClass1A]);
      mockPrisma.teachingAssignment.findMany.mockResolvedValue([]);

      const multiEnrollmentStudent = {
        ...mockStudent1,
        studentEnrollments: [
          { id: 'se-2', classroomId: 'class-1g', status: 'ACTIVE', schoolYearId: 'sy-2026', classroom: mockClass1G },
          { id: 'se-1', classroomId: 'class-1a', status: 'TRANSFERRED', schoolYearId: 'sy-2025', classroom: mockClass1A },
        ],
      };

      mockPrisma.student.count.mockResolvedValue(1);
      mockPrisma.student.findMany
        .mockResolvedValueOnce([multiEnrollmentStudent])
        .mockResolvedValueOnce([{ id: 'student-1', status: 'EXCELLENT', studentAttendances: [] }]);

      const res = await service.findAll({}, 'teacher-a');
      expect(res.items).toHaveLength(1);
      expect(res.totalItems).toBe(1);
      expect(res.items[0].id).toBe('student-1');
    });

    it('queries Student through ACTIVE StudentEnrollment in the accessible classroom scope', async () => {
      mockPrisma.classroom.findMany.mockResolvedValue([mockClass1G]);
      mockPrisma.student.count.mockResolvedValue(1);
      mockPrisma.student.findMany
        .mockResolvedValueOnce([mockStudent1])
        .mockResolvedValueOnce([{ id: 'student-1', status: 'EXCELLENT', studentAttendances: [] }]);

      await service.findAll({}, 'teacher-a');

      expect(mockPrisma.classroom.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          OR: [
            { teacherId: 'teacher-a' },
            { teachingAssignments: { some: { teacherId: 'teacher-a', isActive: true } } },
          ],
        },
        select: { id: true },
      });

      const studentWhere = mockPrisma.student.count.mock.calls[0][0].where;
      expect(studentWhere.AND).toEqual(expect.arrayContaining([
        {
          studentEnrollments: {
            some: expect.objectContaining({
              status: 'ACTIVE',
              classroomId: { in: ['class-1g'] },
            }),
          },
        },
      ]));
      expect(JSON.stringify(studentWhere)).not.toContain('classStudents');
    });

    it('keeps classroom, grade and status filters inside the teacher enrollment scope', async () => {
      mockPrisma.classroom.findMany.mockResolvedValue([mockClass1G, mockClass1A]);
      mockPrisma.student.count.mockResolvedValue(1);
      mockPrisma.student.findMany
        .mockResolvedValueOnce([mockStudent1])
        .mockResolvedValueOnce([{ id: 'student-1', status: 'EXCELLENT', studentAttendances: [] }]);

      await service.findAll(
        { classId: 'class-1g', gradeId: 'grade-1', status: 'EXCELLENT' },
        'teacher-a',
      );

      const studentWhere = mockPrisma.student.count.mock.calls[0][0].where;
      expect(studentWhere.AND).toEqual(expect.arrayContaining([
        { status: 'EXCELLENT' },
        {
          studentEnrollments: {
            some: expect.objectContaining({
              classroomId: { in: ['class-1g'] },
              classroom: expect.objectContaining({ gradeId: 'grade-1' }),
            }),
          },
        },
      ]));
    });

    it('uses the exact list where for summary so KPI count cannot drift', async () => {
      mockPrisma.classroom.findMany.mockResolvedValue([mockClass1G]);
      mockPrisma.student.count.mockResolvedValue(1);
      mockPrisma.student.findMany
        .mockResolvedValueOnce([mockStudent1])
        .mockResolvedValueOnce([{ id: 'student-1', status: 'EXCELLENT', studentAttendances: [] }]);

      await service.findAll({ gradeId: 'grade-1' }, 'teacher-a');

      const listWhere = mockPrisma.student.count.mock.calls[0][0].where;
      const summaryWhere = mockPrisma.student.findMany.mock.calls[1][0].where;
      expect(summaryWhere).toEqual(listWhere);
    });

    it('does not expose teacher A students to teacher B', async () => {
      mockPrisma.classroom.findMany.mockResolvedValue([]);
      const result = await service.findAll({}, 'teacher-b');
      expect(result.items).toEqual([]);
      expect(result.summary.totalStudents).toBe(0);
      expect(mockPrisma.student.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findOne & Anti-IDOR Authorization', () => {
    it('Teacher A can view Student 1 enrolled in Teacher A classroom', async () => {
      mockPrisma.student.findUnique.mockResolvedValueOnce(mockStudent1);
      mockPrisma.classroom.findMany.mockResolvedValueOnce([mockClass1G]);
      mockPrisma.teachingAssignment.findMany.mockResolvedValueOnce([]);

      const result = await service.findOne('student-1', 'teacher-a');
      expect(result.id).toBe('student-1');
      expect(result.name).toBe('Nguyễn Văn A');
    });

    it('Teacher B is FORBIDDEN from viewing Teacher A student', async () => {
      mockPrisma.student.findUnique.mockResolvedValueOnce(mockStudent1);
      mockPrisma.classroom.findMany.mockResolvedValueOnce([]); // Teacher B has no classes matching class-1g
      mockPrisma.teachingAssignment.findMany.mockResolvedValueOnce([]);

      await expect(service.findOne('student-1', 'teacher-b')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create (Student + Enrollment + Duplicate Protection)', () => {
    it('creates student and enrollment successfully within teacher classroom', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClass1G);
      mockPrisma.classroom.findMany.mockResolvedValueOnce([mockClass1G]);
      mockPrisma.teachingAssignment.findMany.mockResolvedValueOnce([]);

      mockPrisma.student.findUnique.mockResolvedValueOnce(null); // studentCode uniqueness
      mockPrisma.classStudent.findFirst.mockResolvedValueOnce(null); // name in class uniqueness

      const createdObj = {
        id: 'student-new',
        fullName: 'Trần Văn B',
        studentCode: 'HS002',
        initials: 'TB',
        gender: 'MALE',
        status: 'EXCELLENT',
        deletedAt: null,
        classStudents: [{ classroomId: 'class-1g', status: 'ACTIVE', classroom: mockClass1G }],
        studentEnrollments: [{ classroomId: 'class-1g', status: 'ACTIVE', schoolYearId: 'sy-2026' }],
        comments: [],
        studentAttendances: [],
        studentAssessments: [],
      };

      mockPrisma.student.create.mockResolvedValueOnce({ id: 'student-new', fullName: 'Trần Văn B' });
      mockPrisma.student.findUnique.mockResolvedValueOnce(createdObj);

      const res = await service.create(
        {
          fullName: 'Trần Văn B',
          studentCode: 'HS002',
          gender: 'Nam',
          classroomId: 'class-1g',
        },
        'teacher-a',
      );

      expect(res.name).toBe('Trần Văn B');
      expect(mockPrisma.studentEnrollment.create).toHaveBeenCalled();
      expect(mockPrisma.classStudent.create).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STUDENT_CREATE' }),
      );
    });

    it('rejects if studentCode already exists', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClass1G);
      mockPrisma.classroom.findMany.mockResolvedValueOnce([mockClass1G]);
      mockPrisma.teachingAssignment.findMany.mockResolvedValueOnce([]);

      mockPrisma.student.findUnique.mockResolvedValueOnce({ id: 'other', studentCode: 'HS001', deletedAt: null });

      await expect(
        service.create(
          {
            fullName: 'Trần Văn B',
            studentCode: 'HS001',
            classroomId: 'class-1g',
          },
          'teacher-a',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('transferStudent (Classroom Transfer with Historical Preservation)', () => {
    it('transfers student from Class 1G to Class 1A without deleting historical records', async () => {
      // 1. findOne check
      mockPrisma.student.findUnique.mockResolvedValueOnce(mockStudent1);
      mockPrisma.classroom.findMany.mockResolvedValueOnce([mockClass1G, mockClass1A]);
      mockPrisma.teachingAssignment.findMany.mockResolvedValueOnce([]);

      // 2. target classroom check
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClass1A);
      mockPrisma.classroom.findMany.mockResolvedValueOnce([mockClass1G, mockClass1A]);
      mockPrisma.teachingAssignment.findMany.mockResolvedValueOnce([]);

      const res = await service.transferStudent(
        'student-1',
        { targetClassroomId: 'class-1a', reason: 'Chuyển phân ban' },
        'teacher-a',
      );

      expect(res.success).toBe(true);
      expect(mockPrisma.studentEnrollment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { studentId: 'student-1', status: 'ACTIVE' },
          data: expect.objectContaining({ status: 'TRANSFERRED' }),
        }),
      );
      expect(mockPrisma.studentEnrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: 'student-1',
            classroomId: 'class-1a',
            status: 'ACTIVE',
          }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STUDENT_TRANSFER' }),
      );
    });
  });

  describe('remove / leave class', () => {
    it('marks enrollment as WITHDRAWN instead of hard deleting historical records', async () => {
      mockPrisma.student.findUnique.mockResolvedValueOnce(mockStudent1);
      mockPrisma.classroom.findMany.mockResolvedValueOnce([mockClass1G]);
      mockPrisma.teachingAssignment.findMany.mockResolvedValueOnce([]);

      const res = await service.remove('student-1', 'teacher-a');
      expect(res.success).toBe(true);
      expect(mockPrisma.studentEnrollment.updateMany).toHaveBeenCalledWith({
        where: { studentId: 'student-1', status: 'ACTIVE' },
        data: { status: 'WITHDRAWN', leftAt: expect.any(Date) },
      });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STUDENT_LEAVE' }),
      );
    });
  });

  describe('importStudents', () => {
    it('validates rows, detects duplicates, and imports valid students', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValueOnce(mockClass1G);
      mockPrisma.classroom.findMany.mockResolvedValueOnce([mockClass1G]);
      mockPrisma.teachingAssignment.findMany.mockResolvedValueOnce([]);

      mockPrisma.student.findUnique.mockResolvedValueOnce(null); // code check
      mockPrisma.student.count.mockResolvedValueOnce(10);
      mockPrisma.student.create.mockResolvedValue({ id: 's-new', fullName: 'Học sinh 1' });

      const res = await service.importStudents(
        {
          classroomId: 'class-1g',
          students: [
            { fullName: 'Học sinh 1', studentCode: 'HS101', gender: 'Nam' },
            { fullName: '', studentCode: 'HS102' }, // invalid (missing name)
          ],
        },
        'teacher-a',
      );

      expect(res.success).toBe(true);
      expect(res.importedCount).toBe(1);
      expect(res.errorCount).toBe(1);
      expect(res.errors[0].message).toContain('Thiếu họ và tên');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STUDENT_IMPORT' }),
      );
    });
  });
});
