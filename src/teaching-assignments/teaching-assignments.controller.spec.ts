import { Test, TestingModule } from '@nestjs/testing';
import { TeachingAssignmentsController } from './teaching-assignments.controller';
import { MeTeachingAssignmentsController } from './me-teaching-assignments.controller';
import { TeachingAssignmentsService } from './teaching-assignments.service';
import { Role } from '@prisma/client';

describe('TeachingAssignmentsController & MeTeachingAssignmentsController', () => {
  let controller: TeachingAssignmentsController;
  let meController: MeTeachingAssignmentsController;
  let service: TeachingAssignmentsService;

  const mockTeacherUser = {
    userId: 'user-teacher-1',
    email: 'teacher1@teachflow.edu.vn',
    role: Role.TEACHER,
    teacherId: 'teacher-1',
  };

  const mockAdminUser = {
    userId: 'user-admin-1',
    email: 'admin@teachflow.edu.vn',
    role: Role.ADMIN,
    teacherId: 'teacher-admin',
  };

  const mockAssignment = {
    id: 'asg-1',
    teacherId: 'teacher-1',
    classroomId: 'class-4a',
    subjectId: 'sub-math',
    schoolYearId: 'sy-2026',
    isActive: true,
  };

  const mockService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findMyAssignments: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeachingAssignmentsController, MeTeachingAssignmentsController],
      providers: [
        { provide: TeachingAssignmentsService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<TeachingAssignmentsController>(TeachingAssignmentsController);
    meController = module.get<MeTeachingAssignmentsController>(MeTeachingAssignmentsController);
    service = module.get<TeachingAssignmentsService>(TeachingAssignmentsService);
    jest.clearAllMocks();
  });

  describe('GET /me/teaching-assignments', () => {
    it('1. Extracts teacherId from JWT token context and returns teacher assignments', async () => {
      mockService.findMyAssignments.mockResolvedValueOnce([mockAssignment]);

      const result = await meController.getMyAssignments(mockTeacherUser, 'sy-2026');
      expect(result).toEqual([mockAssignment]);
      expect(mockService.findMyAssignments).toHaveBeenCalledWith('teacher-1', 'sy-2026');
    });

    it('2. Controller GET /teaching-assignments/me also calls findMyAssignments with token teacherId', async () => {
      mockService.findMyAssignments.mockResolvedValueOnce([mockAssignment]);

      const result = await controller.findMyAssignments(mockTeacherUser);
      expect(result).toEqual([mockAssignment]);
      expect(mockService.findMyAssignments).toHaveBeenCalledWith('teacher-1', undefined);
    });
  });

  describe('Admin vs Teacher authorization in list', () => {
    it('3. Admin can query all teachers assignments', async () => {
      mockService.findAll.mockResolvedValueOnce([mockAssignment]);

      await controller.findAll(mockAdminUser, 'sy-2026', 'teacher-2');
      expect(mockService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolYearId: 'sy-2026',
          teacherId: 'teacher-2',
        }),
      );
    });

    it('4. Teacher is forced to only query their own teacherId', async () => {
      mockService.findAll.mockResolvedValueOnce([mockAssignment]);

      await controller.findAll(mockTeacherUser, 'sy-2026', 'teacher-2'); // Spoofed query param
      // Must be overridden by user.teacherId ('teacher-1')
      expect(mockService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolYearId: 'sy-2026',
          teacherId: 'teacher-1',
        }),
      );
    });
  });

  describe('Teacher & Admin mutations', () => {
    it('5. Teacher self-declare creates assignment with token teacherId', async () => {
      mockService.create.mockResolvedValueOnce(mockAssignment);

      const dto = {
        classroomId: 'class-4a',
        subjectId: 'sub-math',
        schoolYearId: 'sy-2026',
      };
      const result = await controller.create(dto as any, mockTeacherUser);
      expect(result).toEqual(mockAssignment);
      expect(mockService.create).toHaveBeenCalledWith({
        ...dto,
        teacherId: 'teacher-1',
      });
    });

    it('6. Teacher deactivate calls service deactivate with teacherId', async () => {
      mockService.deactivate.mockResolvedValueOnce({ ...mockAssignment, isActive: false });

      const result = await controller.deactivate('asg-1', mockTeacherUser);
      expect(result.isActive).toBe(false);
      expect(mockService.deactivate).toHaveBeenCalledWith('asg-1', 'teacher-1');
    });
  });
});
