import { Test, TestingModule } from '@nestjs/testing';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminTeachersService } from './admin-teachers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

describe('AdminDashboardController', () => {
  let controller: AdminDashboardController;
  let service: AdminTeachersService;

  const mockAdminTeachersService = {
    getSystemStats: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminDashboardController],
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

    controller = module.get<AdminDashboardController>(AdminDashboardController);
    service = module.get<AdminTeachersService>(AdminTeachersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return system stats', async () => {
    const mockStats = {
      totalTeachers: 10,
      activeTeachers: 9,
      lockedTeachers: 1,
      totalAuditLogs: 25,
      recentAuditLogs: [],
      timestamp: '2026-08-22T00:00:00.000Z',
    };
    mockAdminTeachersService.getSystemStats.mockResolvedValue(mockStats);

    const result = await controller.getDashboardStats();
    expect(result).toEqual(mockStats);
    expect(mockAdminTeachersService.getSystemStats).toHaveBeenCalled();
  });
});
