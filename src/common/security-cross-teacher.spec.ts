import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ClassroomsService } from '../classrooms/classrooms.service';
import { StudentsService } from '../students/students.service';
import { AttendanceService } from '../attendance/attendance.service';
import { AssessmentsService } from '../assessments/assessments.service';
import { LessonPlansService } from '../lesson-plans/lesson-plans.service';
import { WorksheetsService } from '../worksheets/worksheets.service';
import { ResourcesService } from '../resources/resources.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushNotificationService } from '../notifications/push-notification.service';
import { HomeroomService } from '../homeroom/homeroom.service';
import { HomeroomExportService } from '../export/homeroom-export.service';
import { ReportsService } from '../reports/reports.service';
import { TeachingPlansService } from '../teaching-plans/teaching-plans.service';
import { StorageService } from '../resources/storage/storage.service';
import { TeachingAssignmentAuthorizationService } from './services/teaching-assignment-authorization.service';
import { AcademicCalculationService } from '../assessments/academic-calculation.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('Cross-Teacher IDOR Absolute Data Isolation Test Suite', () => {
  const teacherAId = 'teacher-A-id';
  const teacherBId = 'teacher-B-id';
  const userA = { userId: 'user-A', email: 'teacherA@teachflow.vn', role: 'TEACHER', teacherId: teacherAId };
  const userB = { userId: 'user-B', email: 'teacherB@teachflow.vn', role: 'TEACHER', teacherId: teacherBId };

  let classroomsService: ClassroomsService;
  let studentsService: StudentsService;
  let attendanceService: AttendanceService;
  let assessmentsService: AssessmentsService;
  let lessonPlansService: LessonPlansService;
  let worksheetsService: WorksheetsService;
  let resourcesService: ResourcesService;
  let notificationsService: NotificationsService;
  let homeroomService: HomeroomService;
  let reportsService: ReportsService;
  let teachingPlansService: TeachingPlansService;

  const mockPrisma = {
    classroom: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    student: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    classStudent: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    studentEnrollment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    attendanceSession: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    assessment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    lessonPlan: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    worksheet: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    teachingResource: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    notification: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    teachingPlan: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    teachingAssignment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    teacher: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassroomsService,
        StudentsService,
        AttendanceService,
        AssessmentsService,
        AcademicCalculationService,
        LessonPlansService,
        WorksheetsService,
        ResourcesService,
        NotificationsService,
        {
          provide: PushNotificationService,
          useValue: {
            sendPushToUser: jest.fn().mockResolvedValue(undefined),
            sendPushToUsers: jest.fn().mockResolvedValue(undefined),
          },
        },
        HomeroomService,
        {
          provide: HomeroomExportService,
          useValue: {
            exportHomeroomDocx: jest.fn(),
            exportHomeroomCsv: jest.fn(),
          },
        },
        ReportsService,
        TeachingPlansService,
        TeachingAssignmentAuthorizationService,
        {
          provide: StorageService,
          useValue: {
            getFileStream: jest.fn(),
            deleteFile: jest.fn(),
            saveFile: jest.fn(),
          },
        },
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => (key === 'UPLOAD_DIR' ? './uploads' : null)),
          },
        },
      ],
    }).compile();

    classroomsService = module.get<ClassroomsService>(ClassroomsService);
    studentsService = module.get<StudentsService>(StudentsService);
    attendanceService = module.get<AttendanceService>(AttendanceService);
    assessmentsService = module.get<AssessmentsService>(AssessmentsService);
    lessonPlansService = module.get<LessonPlansService>(LessonPlansService);
    worksheetsService = module.get<WorksheetsService>(WorksheetsService);
    resourcesService = module.get<ResourcesService>(ResourcesService);
    notificationsService = module.get<NotificationsService>(NotificationsService);
    homeroomService = module.get<HomeroomService>(HomeroomService);
    reportsService = module.get<ReportsService>(ReportsService);
    teachingPlansService = module.get<TeachingPlansService>(TeachingPlansService);

    jest.clearAllMocks();
  });

  describe('1. Classroom Isolation', () => {
    it('Teacher B cannot read Teacher A classroom if not assigned', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'class-A',
        teacherId: teacherAId,
        deletedAt: null,
      });
      mockPrisma.teachingAssignment.findFirst.mockResolvedValue(null);

      await expect(classroomsService.findOne('class-A', teacherBId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('Teacher B cannot update Teacher A classroom', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'class-A',
        teacherId: teacherAId,
        deletedAt: null,
      });

      await expect(
        classroomsService.update('class-A', { name: 'Hacked Class' }, teacherBId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Teacher B cannot delete Teacher A classroom', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'class-A',
        teacherId: teacherAId,
        deletedAt: null,
      });
      mockPrisma.teachingAssignment.findFirst.mockResolvedValue(null);

      await expect(classroomsService.remove('class-A', teacherBId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('2. Student Information Isolation', () => {
    it('Teacher B cannot read Student of Teacher A class', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student-A',
        fullName: 'Nguyen Van A',
        deletedAt: null,
        classStudents: [
          { classroomId: 'class-A', classroom: { id: 'class-A', teacherId: teacherAId } },
        ],
        comments: [],
      });
      mockPrisma.teachingAssignment.count.mockResolvedValue(0);

      await expect(studentsService.findOne('student-A', teacherBId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('Teacher B cannot update Student of Teacher A class', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student-A',
        fullName: 'Nguyen Van A',
        deletedAt: null,
        classStudents: [
          { classroomId: 'class-A', classroom: { id: 'class-A', teacherId: teacherAId } },
        ],
        comments: [],
      });
      mockPrisma.teachingAssignment.count.mockResolvedValue(0);

      await expect(
        studentsService.update('student-A', { fullName: 'Modified Name' }, teacherBId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('3. Attendance Isolation', () => {
    it('Teacher B cannot view or record attendance for Classroom A', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'class-A',
        teacherId: teacherAId,
        deletedAt: null,
      });
      mockPrisma.teachingAssignment.findMany.mockResolvedValue([]);

      await expect(
        attendanceService.getAttendance('class-A', '2026-08-21', teacherBId),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        attendanceService.saveAttendance(
          { classId: 'class-A', date: '2026-08-21', attendances: [] },
          teacherBId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('4. Assessment Isolation', () => {
    it('Teacher B cannot view Assessment created in Classroom A', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({
        id: 'assess-A',
        classroomId: 'class-A',
        classroom: { id: 'class-A', teacherId: teacherAId },
        studentAssessments: [],
      });
      mockPrisma.teachingAssignment.findMany.mockResolvedValue([]);

      await expect(assessmentsService.findOne('assess-A', teacherBId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('5. Pedagogical Artifact Isolation (LessonPlans, Worksheets, Resources, TeachingPlans)', () => {
    it('Teacher B cannot read or update LessonPlan A', async () => {
      mockPrisma.lessonPlan.findUnique.mockResolvedValue({
        id: 'lp-A',
        teacherId: teacherAId,
        deletedAt: null,
        version: 1,
      });

      await expect(lessonPlansService.findOne('lp-A', teacherBId)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        lessonPlansService.update('lp-A', { title: 'Hijacked LP' }, teacherBId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Teacher B cannot read or update Worksheet A', async () => {
      mockPrisma.worksheet.findUnique.mockResolvedValue({
        id: 'ws-A',
        teacherId: teacherAId,
        deletedAt: null,
      });

      await expect(worksheetsService.findOne('ws-A', teacherBId)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        worksheetsService.update('ws-A', { title: 'Hijacked WS' }, teacherBId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Teacher B cannot read, update, or download Resource A', async () => {
      mockPrisma.teachingResource.findUnique.mockResolvedValue({
        id: 'res-A',
        teacherId: teacherAId,
        deletedAt: null,
      });
      mockPrisma.teacher.findUnique.mockResolvedValue({ id: teacherBId });

      await expect(resourcesService.findOne('res-A', userB as any)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        resourcesService.update('res-A', { title: 'Hijacked Res' }, userB as any),
      ).rejects.toThrow(ForbiddenException);
      await expect(resourcesService.getFileForDownload('res-A', userB as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('Teacher B cannot read or update TeachingPlan A', async () => {
      mockPrisma.teachingPlan.findUnique.mockResolvedValue({
        id: 'tp-A',
        teacherId: teacherAId,
        classroom: { id: 'class-A', teacherId: teacherAId },
      });

      await expect(teachingPlansService.findOne('tp-A', teacherBId)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        teachingPlansService.update('tp-A', { title: 'Hijacked TP' }, teacherBId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('6. Notification Isolation', () => {
    it('Teacher B cannot mark as read or delete Teacher A notification', async () => {
      mockPrisma.notification.findUnique.mockResolvedValue({
        id: 'notif-A',
        userId: 'user-A',
        isRead: false,
      });

      await expect(notificationsService.markAsRead('notif-A', 'user-B')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(notificationsService.deleteNotification('notif-A', 'user-B')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('7. Homeroom & Reporting Isolation', () => {
    it('Teacher B cannot access Homeroom dashboard of Classroom A', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'class-A',
        teacherId: teacherAId,
        deletedAt: null,
      });

      await expect(homeroomService.getDashboard('class-A', teacherBId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('Teacher B cannot generate report for Classroom A', async () => {
      mockPrisma.classroom.findFirst.mockResolvedValue(null);

      await expect(
        reportsService.getClassroomSummaryReport('class-A', userB as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
