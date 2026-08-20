import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';
import { HttpStatus, HttpException } from '@nestjs/common';

describe('HealthController', () => {
  let controller: HealthController;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return status ok and database up when database is reachable', async () => {
    (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([{ '1': 1 }]);

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('up');
    expect(result.timestamp).toBeDefined();
  });

  it('should throw HttpException with 503 SERVICE_UNAVAILABLE when database is down', async () => {
    (prismaService.$queryRaw as jest.Mock).mockRejectedValueOnce(new Error('Connection terminated'));

    try {
      await controller.check();
      fail('Expected HttpException 503 to be thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(err.getResponse()).toEqual(
        expect.objectContaining({
          status: 'error',
          database: 'down',
        }),
      );
    }
  });
});
