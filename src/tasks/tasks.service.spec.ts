import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { TasksCleanupService, getTodayVNRange } from './tasks-cleanup.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('TasksService & TasksCleanupService', () => {
  let tasksService: TasksService;
  let cleanupService: TasksCleanupService;

  const mockPrismaService = {
    teacherTask: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        TasksCleanupService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    tasksService = module.get<TasksService>(TasksService);
    cleanupService = module.get<TasksCleanupService>(TasksCleanupService);
  });

  describe('getTodayVNRange', () => {
    it('should return YYYY-MM-DD string and UTC range for Vietnam timezone', () => {
      const range = getTodayVNRange();
      expect(range.todayStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(range.startOfDayUTC).toBeInstanceOf(Date);
      expect(range.endOfDayUTC).toBeInstanceOf(Date);
      expect(range.startOfDayUTC.getTime()).toBeLessThan(range.endOfDayUTC.getTime());
    });
  });

  describe('TasksService.findAll', () => {
    it('should query tasks filtered for today in VN timezone', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Soạn giáo án Toán',
          dueDate: 'Hôm nay',
          done: false,
          taskDate: '2026-08-22',
          priority: 'MEDIUM',
          completedAt: null,
        },
      ];
      mockPrismaService.teacherTask.findMany.mockResolvedValue(mockTasks);

      const result = await tasksService.findAll('teacher-123');

      expect(mockPrismaService.teacherTask.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Soạn giáo án Toán');
    });
  });

  describe('TasksService.create', () => {
    it('should create task with taskDate and teacherId', async () => {
      mockPrismaService.teacherTask.create.mockImplementation(({ data }) => ({
        id: 'new-id',
        ...data,
      }));

      const result = await tasksService.create(
        { title: 'Chấm bài kiểm tra', due: '15:00' },
        'teacher-123',
      );

      expect(result.id).toBe('new-id');
      expect(result.title).toBe('Chấm bài kiểm tra');
      expect(result.taskDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.done).toBe(false);
    });
  });

  describe('TasksService.update', () => {
    it('should update done state and set completedAt', async () => {
      mockPrismaService.teacherTask.findUnique.mockResolvedValue({
        id: 'task-1',
        teacherId: 'teacher-123',
        title: 'Task 1',
        done: false,
      });
      mockPrismaService.teacherTask.update.mockResolvedValue({
        id: 'task-1',
        title: 'Task 1',
        dueDate: 'Hôm nay',
        done: true,
        taskDate: '2026-08-22',
        priority: 'MEDIUM',
        completedAt: new Date(),
      });

      const result = await tasksService.update('task-1', { done: true }, 'teacher-123');

      expect(result.done).toBe(true);
      expect(mockPrismaService.teacherTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
          data: expect.objectContaining({
            done: true,
            status: 'COMPLETED',
          }),
        }),
      );
    });

    it('should throw ForbiddenException if task belongs to another teacher', async () => {
      mockPrismaService.teacherTask.findUnique.mockResolvedValue({
        id: 'task-1',
        teacherId: 'other-teacher',
        title: 'Task 1',
        done: false,
      });

      await expect(
        tasksService.update('task-1', { done: true }, 'teacher-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if task does not exist', async () => {
      mockPrismaService.teacherTask.findUnique.mockResolvedValue(null);

      await expect(
        tasksService.update('task-non-existent', { done: true }, 'teacher-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('TasksCleanupService.cleanupExpiredTasks', () => {
    it('should delete expired tasks older than today', async () => {
      mockPrismaService.teacherTask.deleteMany.mockResolvedValue({ count: 5 });

      const count = await cleanupService.cleanupExpiredTasks();

      expect(count).toBe(5);
      expect(mockPrismaService.teacherTask.deleteMany).toHaveBeenCalled();
    });
  });
});
