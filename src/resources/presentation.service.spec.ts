import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PresentationService } from './presentation.service';
import JSZip = require('jszip');

describe('PresentationService', () => {
  const resourceId = 'b9b4c8ce-61d3-4bbb-8db7-44a2a1be7210';
  const owner = {
    userId: 'user-owner',
    email: 'owner@teachflow.test',
    role: 'TEACHER' as const,
    teacherId: 'teacher-owner',
  };
  let tempRoot: string;
  let sourcePath: string;
  let resource: Record<string, unknown>;
  let prisma: any;
  let storage: any;
  let service: PresentationService;

  beforeEach(async () => {
    tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'teachflow-presentation-test-'));
    sourcePath = path.join(tempRoot, 'source.pptx');
    const archive = new JSZip();
    archive.file('[Content_Types].xml', '<Types />');
    archive.file('ppt/presentation.xml', '<p:presentation />');
    await fs.promises.writeFile(sourcePath, await archive.generateAsync({ type: 'nodebuffer' }));
    resource = {
      id: resourceId,
      teacherId: 'teacher-owner',
      name: 'Bài giảng Toán',
      title: 'Bài giảng Toán',
      originalFileName: 'bai-giang.pptx',
      storedFileName: 'source.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      deletedAt: null,
      updatedAt: new Date('2026-08-29T00:00:00.000Z'),
    };
    prisma = {
      teachingResource: { findUnique: jest.fn().mockImplementation(() => Promise.resolve(resource)) },
      teacher: { findUnique: jest.fn() },
    };
    storage = {
      getUploadDir: jest.fn().mockReturnValue(tempRoot),
      getSafeFilePath: jest.fn().mockReturnValue(sourcePath),
    };
    service = new PresentationService(
      prisma,
      storage,
      { get: jest.fn() } as any,
      { convertPowerPointToPdf: jest.fn() } as any,
    );
    jest.spyOn(service as any, 'convertToSlides').mockImplementation(
      async (_source: string, _operation: string, staging: string) => {
        await fs.promises.writeFile(path.join(staging, 'slide-001.png'), Buffer.from('slide-1'));
        await fs.promises.writeFile(path.join(staging, 'slide-002.png'), Buffer.from('slide-2'));
        return ['slide-001.png', 'slide-002.png'];
      },
    );
  });

  afterEach(async () => {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  });

  it('prepares an authenticated PPTX presentation and serves an authorized slide', async () => {
    const metadata = await service.getPresentation(resourceId, owner);
    const slide = await service.getSlide(resourceId, 1, owner);

    expect(metadata).toEqual({
      resourceId,
      title: 'Bài giảng Toán',
      slideCount: 2,
      slides: [
        { index: 1, url: `/resources/${resourceId}/presentation/slides/1` },
        { index: 2, url: `/resources/${resourceId}/presentation/slides/2` },
      ],
    });
    expect(slide.mimeType).toBe('image/png');
    expect(fs.existsSync(slide.filePath)).toBe(true);
  });

  it('returns 404 when the resource does not exist', async () => {
    prisma.teachingResource.findUnique.mockResolvedValue(null);
    await expect(service.getPresentation(resourceId, owner)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 415 for a non-PowerPoint resource', async () => {
    resource.originalFileName = 'document.pdf';
    resource.mimeType = 'application/pdf';
    await expect(service.getPresentation(resourceId, owner)).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('rejects a ZIP renamed to PPTX when PowerPoint OpenXML parts are missing', async () => {
    const spoofed = new JSZip();
    spoofed.file('payload.txt', 'not a presentation');
    await fs.promises.writeFile(sourcePath, await spoofed.generateAsync({ type: 'nodebuffer' }));
    await expect(service.getPresentation(resourceId, owner)).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('blocks cross-teacher IDOR with 403', async () => {
    const otherTeacher = { ...owner, userId: 'other', teacherId: 'teacher-other' };
    await expect(service.getPresentation(resourceId, otherTeacher)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reuses cached slides without converting again', async () => {
    const converter = jest.spyOn(service as any, 'convertToSlides');
    await service.getPresentation(resourceId, owner);
    await service.getPresentation(resourceId, owner);
    expect(converter).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cache after the source version changes', async () => {
    const converter = jest.spyOn(service as any, 'convertToSlides');
    await service.getPresentation(resourceId, owner);
    resource.updatedAt = new Date('2026-08-29T01:00:00.000Z');
    await service.getPresentation(resourceId, owner);
    expect(converter).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent conversion requests for the same resource', async () => {
    const converter = jest.spyOn(service as any, 'convertToSlides');
    await Promise.all([
      service.getPresentation(resourceId, owner),
      service.getPresentation(resourceId, owner),
      service.getPresentation(resourceId, owner),
    ]);
    expect(converter).toHaveBeenCalledTimes(1);
  });

  it('returns a safe 500 and cleans staging output after conversion failure', async () => {
    jest.spyOn(service as any, 'convertToSlides').mockRejectedValueOnce(new Error('converter details'));
    await expect(service.getPresentation(resourceId, owner)).rejects.toBeInstanceOf(InternalServerErrorException);

    const resourceCache = path.join(tempRoot, 'presentations', resourceId);
    const entries = fs.existsSync(resourceCache) ? await fs.promises.readdir(resourceCache) : [];
    expect(entries.some((entry) => entry.startsWith('.staging-'))).toBe(false);
  });
});
