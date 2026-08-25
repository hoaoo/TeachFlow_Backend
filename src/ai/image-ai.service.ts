import { ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common';
import { GeminiProvider } from './providers/gemini.provider';
import { GenerateImageDto } from './dto/generate-image.dto';
import { buildImagePrompt } from './prompts/image.prompt';
import { ResourcesService } from '../resources/resources.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class ImageAiService {
  private readonly logger = new Logger(ImageAiService.name);

  constructor(
    private readonly provider: GeminiProvider,
    private readonly resourcesService: ResourcesService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async generate(dto: GenerateImageDto, user: AuthenticatedUser) {
    const prompt = buildImagePrompt(dto);
    const image = await this.provider.generateImage({
      operation: 'image',
      prompt,
      aspectRatio: dto.aspectRatio || '1:1',
    });

    const resource = await this.resourcesService.saveGeneratedFile(user, {
      buffer: image.buffer,
      extension: image.mimeType === 'image/jpeg' ? '.jpg' : '.png',
      mimeType: image.mimeType || 'image/png',
      name: dto.title?.trim() || 'Ảnh minh họa AI',
      description: dto.prompt.trim(),
      resourceType: 'IMAGE',
    });

    if (dto.lessonPlanId && this.prisma && user.teacherId) {
      const plan = await this.prisma.lessonPlan.findUnique({
        where: { id: dto.lessonPlanId },
        select: { id: true, teacherId: true, deletedAt: true },
      });
      if (!plan || plan.deletedAt) {
        throw new ForbiddenException('Không tìm thấy giáo án để đính kèm ảnh');
      }
      if (plan.teacherId !== user.teacherId) {
        throw new ForbiddenException('Bạn không có quyền đính kèm ảnh vào giáo án này');
      }
      await this.prisma.lessonPlanResource.upsert({
        where: {
          lessonPlanId_resourceId: {
            lessonPlanId: dto.lessonPlanId,
            resourceId: resource.id,
          },
        },
        update: {},
        create: {
          lessonPlanId: dto.lessonPlanId,
          resourceId: resource.id,
        },
      });
    }

    this.logger.log(`[AI] operation=image teacherId=${user.teacherId || 'unknown'} resourceId=${resource.id} status=SUCCESS`);

    return {
      resourceId: resource.id,
      storageKey: resource.originalFileName ? undefined : resource.id,
      storedFileName: (resource as any).storedFileName,
      fileName: resource.originalFileName || resource.name,
      mimeType: resource.mimeType,
      name: resource.name,
      resourceType: resource.resourceType,
      formattedSize: resource.formattedSize,
      id: resource.id,
    };
  }
}
