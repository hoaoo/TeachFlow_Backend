import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { TeachingAssignmentsController } from './teaching-assignments.controller';
import { MeTeachingAssignmentsController } from './me-teaching-assignments.controller';
import { TeachingAssignmentsService } from './teaching-assignments.service';
import { Role } from '@prisma/client';

describe('TeachingAssignmentsController Security & Isolation', () => {
  let controller: TeachingAssignmentsController;
  let meController: MeTeachingAssignmentsController;
  let service: TeachingAssignmentsService;

  const mockTeacherA = {
    userId: 'user-teacher-a',
    email: 'teacher.a@teachflow.edu.vn',
    role: Role.TEACHER,
    teacherId: 'teacher-a',
  };

  const mockTeacherB = {
    userId: 'user-teacher-b',
    email: 'teacher.b@teachflow.edu.vn',
    role: Role.TEACHER,
    teacherId: 'teacher-b',
  };

  const mockAdminUser = {
    userId: 'user-admin-1',
    email: 'admin@teachflow.edu.vn',
    role: Role.ADMIN,
    teacherId: undefined as any,
  };

  const mockAssignmentA = {
    id: 'asg-a',
    teacherId: 'teacher-a',
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

  // ─── 1. JWT-scoped teacher context ───────────────────────────────────────

  describe('GET /me/teaching-assignments — JWT scoped', () => {
    it('1. Extracts teacherId from JWT token and returns own assignments', async () => {
      mockService.findMyAssignments.mockResolvedValueOnce([mockAssignmentA]);

      const result = await meController.getMyAssignments(mockTeacherA, 'sy-2026');
      expect(result).toEqual([mockAssignmentA]);
      expect(mockService.findMyAssignments).toHaveBeenCalledWith('teacher-a', 'sy-2026');
    });

    it('2. GET /teaching-assignments/me also uses token teacherId', async () => {
      mockService.findMyAssignments.mockResolvedValueOnce([mockAssignmentA]);

      const result = await controller.findMyAssignments(mockTeacherA);
      expect(result).toEqual([mockAssignmentA]);
      expect(mockService.findMyAssignments).toHaveBeenCalledWith('teacher-a', undefined);
    });
  });

  // ─── 2. Teacher self-declaration (teaching context) ───────────────────────

  describe('POST /teaching-assignments — Teacher self-declaration', () => {
    it('3. Teacher A self-declares teaching context → 201 with teacherId from JWT', async () => {
      mockService.create.mockResolvedValueOnce(mockAssignmentA);

      const dto = { classroomId: 'class-4a', subjectId: 'sub-math', schoolYearId: 'sy-2026' };
      const result = await controller.create(dto as any, mockTeacherA);

      expect(result).toEqual(mockAssignmentA);
      // teacherId must be from JWT, not from dto
      expect(mockService.create).toHaveBeenCalledWith({
        ...dto,
        teacherId: 'teacher-a',
      });
    });

    it('4. Teacher A sends dto with teacherId=teacher-b → teacherId is ignored, uses JWT teacher-a', async () => {
      mockService.create.mockResolvedValueOnce(mockAssignmentA);

      // Simulate spoofed body: dto contains teacherId for teacher-b
      // The DTO class no longer has teacherId exposed from HTTP layer, but test confirms
      // controller injects user.teacherId regardless
      const dto = { classroomId: 'class-4b', subjectId: 'sub-math', teacherId: 'teacher-b' };
      const result = await controller.create(dto as any, mockTeacherA);

      expect(result).toEqual(mockAssignmentA);
      // The service must receive teacher-a's teacherId, never teacher-b
      expect(mockService.create).toHaveBeenCalledWith(
        expect.objectContaining({ teacherId: 'teacher-a' }),
      );
      expect(mockService.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ teacherId: 'teacher-b' }),
      );
    });
  });

  // ─── 3. Teacher PATCH own assignment → success ────────────────────────────

  describe('PATCH /teaching-assignments/:id — Teacher update own context', () => {
    it('5. Teacher A updates own teaching context → passes teacherId to service', async () => {
      mockService.update.mockResolvedValueOnce({ ...mockAssignmentA, subjectId: 'sub-viet' });

      const result = await controller.update('asg-a', { subjectId: 'sub-viet' } as any, mockTeacherA);
      expect(result.subjectId).toBe('sub-viet');
      expect(mockService.update).toHaveBeenCalledWith('asg-a', { subjectId: 'sub-viet' }, 'teacher-a');
    });
  });

  // ─── 4. Teacher DELETE own assignment → success ───────────────────────────

  describe('DELETE /teaching-assignments/:id — Teacher deactivate own context', () => {
    it('6. Teacher A deactivates own context → service called with teacher-a', async () => {
      mockService.deactivate.mockResolvedValueOnce({ ...mockAssignmentA, isActive: false });

      const result = await controller.deactivate('asg-a', mockTeacherA);
      expect(result.isActive).toBe(false);
      expect(mockService.deactivate).toHaveBeenCalledWith('asg-a', 'teacher-a');
    });
  });

  // ─── 5. GET scoped to authenticated teacher only ─────────────────────────

  describe('GET /teaching-assignments — Scoped to authenticated teacher', () => {
    it('7. Teacher is forced to query only their own teacherId (cannot spoof teacherId param)', async () => {
      mockService.findAll.mockResolvedValueOnce([mockAssignmentA]);

      await controller.findAll(mockTeacherA, 'sy-2026', 'class-4a', 'sub-math', undefined, undefined);
      // Must be called with teacherId from JWT, not from query
      expect(mockService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ teacherId: 'teacher-a' }),
      );
    });
  });

  // ─── 6. Admin is BLOCKED from ALL assignment endpoints ───────────────────

  describe('Admin → 403 on all teaching context endpoints', () => {
    it('8. Admin POST teaching assignment → ForbiddenException 403', async () => {
      await expect(
        controller.create({ classroomId: 'c1', subjectId: 's1' } as any, mockAdminUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockService.create).not.toHaveBeenCalled();
    });

    it('9. Admin PATCH teaching assignment → ForbiddenException 403', async () => {
      await expect(
        controller.update('asg-a', { isActive: false } as any, mockAdminUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockService.update).not.toHaveBeenCalled();
    });

    it('10. Admin DELETE teaching assignment → ForbiddenException 403', async () => {
      await expect(
        controller.deactivate('asg-a', mockAdminUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockService.deactivate).not.toHaveBeenCalled();
    });

    it('11. Admin GET /teaching-assignments (list) → ForbiddenException 403', async () => {
      await expect(
        controller.findAll(mockAdminUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockService.findAll).not.toHaveBeenCalled();
    });

    it('12. Admin GET /teaching-assignments/:id → ForbiddenException 403', async () => {
      await expect(
        controller.findOne('asg-a', mockAdminUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockService.findOne).not.toHaveBeenCalled();
    });
  });
});

