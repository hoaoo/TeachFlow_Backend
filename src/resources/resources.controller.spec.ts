import { Test, TestingModule } from '@nestjs/testing';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

describe('ResourcesController', () => {
  let controller: ResourcesController;
  let service: ResourcesService;

  const mockResourcesService = {
    uploadResource: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    getFileForDownload: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResourcesController],
      providers: [
        {
          provide: ResourcesService,
          useValue: mockResourcesService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ResourcesController>(ResourcesController);
    service = module.get<ResourcesService>(ResourcesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /api/resources/upload', () => {
    it('should upload file and return resource', async () => {
      const mockFile = { originalname: 'doc.pdf', size: 100 } as any;
      const user = { userId: 'u-1', email: 't@test.com', role: 'TEACHER' as const, teacherId: 't-1' };
      const expected = { id: 'res-1', name: 'doc.pdf' };
      mockResourcesService.uploadResource.mockResolvedValue(expected);

      const result = await controller.upload(mockFile, { name: 'Tài liệu' }, user);
      expect(mockResourcesService.uploadResource).toHaveBeenCalledWith(mockFile, { name: 'Tài liệu' }, user);
      expect(result).toEqual(expected);
    });
  });

  describe('GET /api/resources', () => {
    it('should pass query filters to service', async () => {
      const user = { userId: 'u-1', email: 't@test.com', role: 'TEACHER' as const, teacherId: 't-1' };
      mockResourcesService.findAll.mockResolvedValue([]);

      await controller.findAll(user, 'sub-1', 'grade-1', 'DOCUMENT', 'bài giảng');
      expect(mockResourcesService.findAll).toHaveBeenCalledWith(user, {
        subjectId: 'sub-1',
        gradeId: 'grade-1',
        resourceType: 'DOCUMENT',
        search: 'bài giảng',
      });
    });
  });
});
