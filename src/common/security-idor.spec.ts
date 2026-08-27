import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ClassroomsService } from '../classrooms/classrooms.service';
import { LessonPlansService } from '../lesson-plans/lesson-plans.service';
import { WorksheetsService } from '../worksheets/worksheets.service';
import { StudentsService } from '../students/students.service';
import { StudentCommentsService } from '../student-comments/student-comments.service';
import { ResourcesService } from '../resources/resources.service';
import { TasksService } from '../tasks/tasks.service';
import { AttendanceService } from '../attendance/attendance.service';
import { AssessmentsService } from '../assessments/assessments.service';
import { AcademicCalculationService } from '../assessments/academic-calculation.service';
import { ActivityLibraryService } from '../activity-library/activity-library.service';
import { TeachingPlansService } from '../teaching-plans/teaching-plans.service';
import { ExportService } from '../export/export.service';
import { LessonPlanExportService } from '../export/lesson-plan-export.service';
import { WorksheetExportService } from '../export/worksheet-export.service';
import { StorageService } from '../resources/storage/storage.service';
import { PreviewService } from '../resources/preview.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

import { TeachingAssignmentAuthorizationService } from './services/teaching-assignment-authorization.service';

describe('Security IDOR & Cross-Teacher Isolation Invariant Tests', () => {
  const teacherAId = 'teacher-A-uuid';
  const teacherBId = 'teacher-B-uuid';

  const userA = {
    userId: 'user-A-uuid',
    email: 'teacherA@teachflow.vn',
    role: 'TEACHER',
    teacherId: teacherAId,
  };

  const mockPrisma = {
    classroom: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    lessonPlan: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    worksheet: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    student: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    classStudent: {
      create: jest.fn(),
    },
    teachingResource: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    teachingActivity: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    teachingPlan: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    teacherTask: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    attendanceSession: {
      findUnique: jest.fn(),
    },
    assessment: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    studentComment: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    teacher: {
      findUnique: jest.fn(),
    },
    teachingAssignment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    studentEnrollment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn((cb) => (typeof cb === 'function' ? cb(mockPrisma) : Promise.all(cb))),
  };

  let classroomsService: ClassroomsService;
  let lessonPlansService: LessonPlansService;
  let worksheetsService: WorksheetsService;
  let studentsService: StudentsService;
  let studentCommentsService: StudentCommentsService;
  let teachingPlansService: TeachingPlansService;
  let assessmentsService: AssessmentsService;
  let activityLibraryService: ActivityLibraryService;
  let resourcesService: ResourcesService;
  let tasksService: TasksService;
  let exportService: ExportService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeachingAssignmentAuthorizationService,
        ClassroomsService,
        LessonPlansService,
        WorksheetsService,
        StudentsService,
        StudentCommentsService,
        TeachingPlansService,
        AssessmentsService,
        AcademicCalculationService,
        ActivityLibraryService,
        ResourcesService,
        TasksService,
        AttendanceService,
        ExportService,
        LessonPlanExportService,
        WorksheetExportService,
        {
          provide: StorageService,
          useValue: {
            saveFile: jest.fn(),
            getSafeFilePath: jest.fn(),
            fileExists: jest.fn(),
            deleteFile: jest.fn(),
          },
        },
        {
          provide: PreviewService,
          useValue: {
            processResourcePreview: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('25'),
          },
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    classroomsService = module.get<ClassroomsService>(ClassroomsService);
    lessonPlansService = module.get<LessonPlansService>(LessonPlansService);
    worksheetsService = module.get<WorksheetsService>(WorksheetsService);
    studentsService = module.get<StudentsService>(StudentsService);
    studentCommentsService = module.get<StudentCommentsService>(StudentCommentsService);
    teachingPlansService = module.get<TeachingPlansService>(TeachingPlansService);
    assessmentsService = module.get<AssessmentsService>(AssessmentsService);
    activityLibraryService = module.get<ActivityLibraryService>(ActivityLibraryService);
    resourcesService = module.get<ResourcesService>(ResourcesService);
    tasksService = module.get<TasksService>(TasksService);
    exportService = module.get<ExportService>(ExportService);
  });

  describe('1. Direct Object Access (IDOR) - Classroom Module', () => {
    it('Teacher A should receive ForbiddenException when accessing Classroom of Teacher B', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'class-B',
        teacherId: teacherBId,
        deletedAt: null,
      });

      await expect(classroomsService.findOne('class-B', teacherAId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('Teacher A should receive ForbiddenException when updating Classroom of Teacher B', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'class-B',
        teacherId: teacherBId,
        deletedAt: null,
      });

      await expect(
        classroomsService.update('class-B', { name: 'Hacked' }, teacherAId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('2. Direct Object Access (IDOR) - Lesson Plan Module', () => {
    it('Teacher A should receive ForbiddenException when accessing Lesson Plan of Teacher B', async () => {
      mockPrisma.lessonPlan.findUnique.mockResolvedValue({
        id: 'plan-B',
        teacherId: teacherBId,
        deletedAt: null,
      });

      await expect(lessonPlansService.findOne('plan-B', teacherAId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('Teacher A should receive ForbiddenException when exporting Lesson Plan of Teacher B', async () => {
      mockPrisma.lessonPlan.findUnique.mockResolvedValue({
        id: 'plan-B',
        teacherId: teacherBId,
        deletedAt: null,
        title: 'Plan B',
      });

      await expect(exportService.exportLessonPlanDocx('plan-B', userA)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('Teacher A should receive ForbiddenException when previewing Lesson Plan of Teacher B', async () => {
      mockPrisma.lessonPlan.findUnique.mockResolvedValue({
        id: 'plan-B',
        teacherId: teacherBId,
        deletedAt: null,
        title: 'Plan B',
      });

      await expect(lessonPlansService.previewById('plan-B', teacherAId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('3. Direct Object Access (IDOR) - Worksheet Module', () => {
    it('Teacher A should receive ForbiddenException when accessing Worksheet of Teacher B', async () => {
      mockPrisma.worksheet.findUnique.mockResolvedValue({
        id: 'worksheet-B',
        teacherId: teacherBId,
        deletedAt: null,
      });

      await expect(worksheetsService.findOne('worksheet-B', teacherAId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('Teacher A should receive ForbiddenException when previewing Worksheet of Teacher B', async () => {
      mockPrisma.worksheet.findUnique.mockResolvedValue({
        id: 'worksheet-B',
        teacherId: teacherBId,
        deletedAt: null,
        title: 'Phiếu B',
        questions: [],
      });

      await expect(worksheetsService.previewById('worksheet-B', teacherAId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('4. Direct Object Access (IDOR) - Resource Module', () => {
    it('Teacher A should receive ForbiddenException when downloading Resource of Teacher B', async () => {
      mockPrisma.teachingResource.findUnique.mockResolvedValue({
        id: 'resource-B',
        teacherId: teacherBId,
        deletedAt: null,
        storedFileName: 'uuid.pdf',
      });

      await expect(resourcesService.getFileForDownload('resource-B', userA)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('5. Cross-Parent Resource Hijacking Invariant', () => {
    it('Teacher A should not be allowed to attach Resource of Teacher B to Teacher A Lesson Plan', async () => {
      mockPrisma.lessonPlan.findUnique.mockResolvedValue({
        id: 'plan-A',
        teacherId: teacherAId,
        deletedAt: null,
      });

      mockPrisma.teachingResource.findUnique.mockResolvedValue({
        id: 'resource-B',
        teacherId: teacherBId,
        deletedAt: null,
      });

      await expect(
        lessonPlansService.attachResource('plan-A', 'resource-B', teacherAId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('6. Regression Tests: Fixed Vulnerabilities', () => {
    // VULN-IDOR-001 Fix Regression Test
    it('VULN-IDOR-001: Teacher A should be REJECTED when creating comment for Student of Teacher B (no DB write)', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student-B',
        fullName: 'Bao',
        deletedAt: null,
        classStudents: [
          {
            classroomId: 'class-B',
            classroom: { teacherId: teacherBId, deletedAt: null },
          },
        ],
      });

      await expect(
        studentCommentsService.createForStudent(
          'student-B',
          { content: 'Attacker comment' },
          teacherAId,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.studentComment.create).not.toHaveBeenCalled();
    });

    // VULN-IDOR-002 Fix Regression Test
    it('VULN-IDOR-002: Teacher A should be REJECTED when creating student in Classroom of Teacher B (no DB write)', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'class-B',
        teacherId: teacherBId,
        deletedAt: null,
      });

      await expect(
        studentsService.create(
          { fullName: 'New Student', classId: 'class-B' },
          teacherAId,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.student.create).not.toHaveBeenCalled();
      expect(mockPrisma.classStudent.create).not.toHaveBeenCalled();
    });

    // VULN-IDOR-003 Fix Regression Test
    it('VULN-IDOR-003: Teacher A should be REJECTED when creating teaching plan with Classroom of Teacher B (no DB write)', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'class-B',
        teacherId: teacherBId,
        deletedAt: null,
      });

      await expect(
        teachingPlansService.create(
          { title: 'Plan', classroomId: 'class-B', subjectId: 'subject-1' },
          teacherAId,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.teachingPlan.create).not.toHaveBeenCalled();
    });

    // VULN-IDOR-004 Fix Regression Test
    it('VULN-IDOR-004: Teacher A should be REJECTED when creating assessment with Classroom of Teacher B (no DB write)', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'class-B',
        teacherId: teacherBId,
        deletedAt: null,
      });

      await expect(
        assessmentsService.create(
          { title: 'Assessment', classroomId: 'class-B' },
          teacherAId,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.assessment.create).not.toHaveBeenCalled();
    });

    // VULN-AUTH-005 Fix Regression Test
    it('VULN-AUTH-005: Teacher A should be REJECTED when attempting to PATCH or DELETE a system activity (teacherId: null)', async () => {
      mockPrisma.teachingActivity.findUnique.mockResolvedValue({
        id: 'system-act-1',
        title: 'System Activity',
        teacherId: null,
        deletedAt: null,
      });

      await expect(
        activityLibraryService.update('system-act-1', { title: 'Modified' }, teacherAId),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        activityLibraryService.remove('system-act-1', teacherAId),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.teachingActivity.update).not.toHaveBeenCalled();
    });

    it('VULN-AUTH-005: Teacher A should be ALLOWED to PATCH or DELETE their own activity', async () => {
      mockPrisma.teachingActivity.findUnique.mockResolvedValue({
        id: 'act-A',
        title: 'Teacher A Activity',
        teacherId: teacherAId,
        deletedAt: null,
      });
      mockPrisma.teachingActivity.update.mockResolvedValue({
        id: 'act-A',
        title: 'Updated A Activity',
        teacherId: teacherAId,
      });

      const updated = await activityLibraryService.update(
        'act-A',
        { title: 'Updated A Activity' },
        teacherAId,
      );
      expect(updated.title).toBe('Updated A Activity');

      const removed = await activityLibraryService.remove('act-A', teacherAId);
      expect(removed.success).toBe(true);
    });
  });
});
