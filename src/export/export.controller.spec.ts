import { Test, TestingModule } from '@nestjs/testing';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

describe('ExportController', () => {
  let controller: ExportController;
  let service: ExportService;

  const mockExportService = {
    exportLessonPlanDocx: jest.fn(),
    exportLessonPlanPdf: jest.fn(),
    exportWorksheetDocx: jest.fn(),
    exportWorksheetPdf: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExportController],
      providers: [
        {
          provide: ExportService,
          useValue: mockExportService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ExportController>(ExportController);
    service = module.get<ExportService>(ExportService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /api/lesson-plans/:id/export/docx', () => {
    it('should set docx headers and send buffer', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      const mockBuffer = Buffer.from('mock docx');
      mockExportService.exportLessonPlanDocx.mockResolvedValue({
        buffer: mockBuffer,
        asciiFilename: 'Giao_an.docx',
        utf8Filename: 'Giáo_án.docx',
      });

      const user = { userId: 'u-1', email: 't@test.com', role: 'TEACHER' as const, teacherId: 't-1' };
      await controller.exportLessonPlanDocx('plan-1', user, mockRes);

      expect(mockExportService.exportLessonPlanDocx).toHaveBeenCalledWith('plan-1', user);
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('Giao_an.docx'),
      );
      expect(mockRes.send).toHaveBeenCalledWith(mockBuffer);
    });
  });

  describe('GET /api/lesson-plans/:id/export/pdf', () => {
    it('should set pdf headers and send buffer', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      const mockBuffer = Buffer.from('mock pdf');
      mockExportService.exportLessonPlanPdf.mockResolvedValue({
        buffer: mockBuffer,
        asciiFilename: 'Giao_an.pdf',
        utf8Filename: 'Giáo_án.pdf',
      });

      const user = { userId: 'u-1', email: 't@test.com', role: 'TEACHER' as const, teacherId: 't-1' };
      await controller.exportLessonPlanPdf('plan-1', user, mockRes);

      expect(mockExportService.exportLessonPlanPdf).toHaveBeenCalledWith('plan-1', user);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.send).toHaveBeenCalledWith(mockBuffer);
    });
  });

  describe('GET /api/worksheets/:id/export/docx', () => {
    it('should pass includeAnswers correctly to service', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      const mockBuffer = Buffer.from('mock worksheet docx');
      mockExportService.exportWorksheetDocx.mockResolvedValue({
        buffer: mockBuffer,
        asciiFilename: 'Phieu_hoc_tap.docx',
        utf8Filename: 'Phiếu_học_tập.docx',
      });

      const user = { userId: 'u-1', email: 't@test.com', role: 'TEACHER' as const, teacherId: 't-1' };
      await controller.exportWorksheetDocx('ws-1', 'true', user, mockRes);

      expect(mockExportService.exportWorksheetDocx).toHaveBeenCalledWith('ws-1', user, true);
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(mockRes.send).toHaveBeenCalledWith(mockBuffer);
    });
  });

  describe('GET /api/worksheets/:id/export/pdf', () => {
    it('should pass includeAnswers correctly to service and set PDF header', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      const mockBuffer = Buffer.from('mock worksheet pdf');
      mockExportService.exportWorksheetPdf.mockResolvedValue({
        buffer: mockBuffer,
        asciiFilename: 'Phieu_hoc_tap.pdf',
        utf8Filename: 'Phiếu_học_tập.pdf',
      });

      const user = { userId: 'u-1', email: 't@test.com', role: 'TEACHER' as const, teacherId: 't-1' };
      await controller.exportWorksheetPdf('ws-1', 'false', user, mockRes);

      expect(mockExportService.exportWorksheetPdf).toHaveBeenCalledWith('ws-1', user, false);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.send).toHaveBeenCalledWith(mockBuffer);
    });
  });
});
