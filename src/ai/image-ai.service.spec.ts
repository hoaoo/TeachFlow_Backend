import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ImageAiService } from './image-ai.service';
import { GeminiProvider } from './providers/gemini.provider';
import { ResourcesService } from '../resources/resources.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ImageAiService', () => {
  let service: ImageAiService;
  const mockProvider = {
    generateImage: jest.fn(),
  };
  const mockResources = {
    saveGeneratedFile: jest.fn(),
  };
  const mockPrisma = {
    lessonPlan: { findUnique: jest.fn() },
    lessonPlanResource: { upsert: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageAiService,
        { provide: GeminiProvider, useValue: mockProvider },
        { provide: ResourcesService, useValue: mockResources },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(ImageAiService);
  });

  it('saves generated image via storage/resource metadata only', async () => {
    mockProvider.generateImage.mockResolvedValue({
      buffer: Buffer.from('png'),
      mimeType: 'image/png',
    });
    mockResources.saveGeneratedFile.mockResolvedValue({
      id: 'res-1',
      originalFileName: 'Anh_minh_hoa.png',
      mimeType: 'image/png',
      name: 'Ảnh minh họa AI',
      resourceType: 'IMAGE',
      formattedSize: '3 KB',
      storedFileName: 'uuid.png',
    });

    const result = await service.generate(
      { prompt: 'minh họa phân số' } as any,
      { userId: 'u', email: 'a@test.com', role: 'TEACHER', teacherId: 't1' },
    );

    expect(result.resourceId).toBe('res-1');
    expect(result.mimeType).toBe('image/png');
    expect(JSON.stringify(result)).not.toContain('data:image');
    expect(mockResources.saveGeneratedFile).toHaveBeenCalled();
  });

  it('does not attach image to another teacher lesson plan', async () => {
    mockProvider.generateImage.mockResolvedValue({ buffer: Buffer.from('png'), mimeType: 'image/png' });
    mockResources.saveGeneratedFile.mockResolvedValue({
      id: 'res-1',
      originalFileName: 'a.png',
      mimeType: 'image/png',
      name: 'Ảnh',
      resourceType: 'IMAGE',
    });
    mockPrisma.lessonPlan.findUnique.mockResolvedValue({
      id: 'plan-B',
      teacherId: 'teacher-B',
      deletedAt: null,
    });

    await expect(
      service.generate(
        { prompt: 'minh họa', lessonPlanId: 'plan-B' } as any,
        { userId: 'u', email: 'a@test.com', role: 'TEACHER', teacherId: 'teacher-A' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
