import { Test, TestingModule } from '@nestjs/testing';
import { AdminTeachersController } from './admin-teachers.controller';
import { AdminTeachersService } from './admin-teachers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

describe('AdminTeachersController', () => {
  let controller: AdminTeachersController;
  let service: AdminTeachersService;

  const mockAdminTeachersService = {
    listTeachers: jest.fn(),
    getTeacher: jest.fn(),
    createTeacher: jest.fn(),
    updateTeacher: jest.fn(),
    updateTeacherStatus: jest.fn(),
    resetTeacherPassword: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminTeachersController],
      providers: [
        {
          provide: AdminTeachersService,
          useValue: mockAdminTeachersService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminTeachersController>(AdminTeachersController);
    service = module.get<AdminTeachersService>(AdminTeachersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call listTeachers with query', async () => {
    mockAdminTeachersService.listTeachers.mockResolvedValue({ items: [], totalItems: 0 });
    await controller.listTeachers({ page: 1, pageSize: 20 });
    expect(mockAdminTeachersService.listTeachers).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  it('should call createTeacher with dto and actorUser', async () => {
    const dto = { email: 'lan@teachflow.vn', fullName: 'Lan', password: 'Pass' };
    const actorUser = { userId: 'admin-1', email: 'admin@teachflow.vn', role: 'ADMIN' };
    await controller.createTeacher(dto as any, actorUser);
    expect(mockAdminTeachersService.createTeacher).toHaveBeenCalledWith(dto, actorUser);
  });
});
