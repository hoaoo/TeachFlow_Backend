import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as XLSX from 'xlsx';
import { ImportAiService } from './import-ai.service';
import { GeminiProvider } from './providers/gemini.provider';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';

function makeXlsx(rows: Record<string, string>[]): Buffer {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

describe('ImportAiService', () => {
  let service: ImportAiService;
  const mockProvider = {
    generateStructured: jest.fn(),
    getMaxInputChars: jest.fn().mockReturnValue(20000),
  };
  const mockAccess = {
    assertTeacherCanAccessClassroom: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportAiService,
        { provide: GeminiProvider, useValue: mockProvider },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('10') } },
        { provide: TeachingAssignmentAuthorizationService, useValue: mockAccess },
      ],
    }).compile();
    service = module.get(ImportAiService);
  });

  it('parses a valid spreadsheet without writing DB', async () => {
    const buffer = makeXlsx([
      { 'Họ và tên': 'Nguyễn Văn A', 'Ngày sinh': '12/03/2018', 'Giới tính': 'Nam' },
      { 'Họ và tên': 'Nguyễn Văn B', 'Ngày sinh': 'invalid date', 'Giới tính': 'Nam' },
    ]);
    const file = {
      originalname: 'hocsinh.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buffer.length,
      buffer,
    } as Express.Multer.File;

    const result = await service.analyze(file, { target: 'students' }, { userId: 'u', email: 'a@test.com', role: 'TEACHER', teacherId: 't1' });

    expect(result.persisted).toBe(false);
    expect(result.target).toBe('students');
    if (result.target !== 'students') throw new Error('expected students import');
    expect(result.totalRows).toBe(2);
    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(mockProvider.generateStructured).not.toHaveBeenCalled();
  });

  it('rejects unsupported extensions', async () => {
    const file = {
      originalname: 'malware.exe',
      mimetype: 'application/octet-stream',
      size: 10,
      buffer: Buffer.from('MZ'),
    } as Express.Multer.File;

    await expect(
      service.analyze(file, { target: 'students' }, { userId: 'u', email: 'a@test.com', role: 'TEACHER', teacherId: 't1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects oversized files', async () => {
    const file = {
      originalname: 'ds.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 20 * 1024 * 1024,
      buffer: Buffer.alloc(16),
    } as Express.Multer.File;

    await expect(
      service.analyze(file, { target: 'students' }, { userId: 'u', email: 'a@test.com', role: 'TEACHER', teacherId: 't1' }),
    ).rejects.toThrow(PayloadTooLargeException);
  });

  it('does not allow analyzing import for another teacher classroom', async () => {
    mockAccess.assertTeacherCanAccessClassroom.mockRejectedValue(new ForbiddenException('no'));
    const buffer = makeXlsx([{ 'Họ và tên': 'A' }]);
    const file = {
      originalname: 'hocsinh.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buffer.length,
      buffer,
    } as Express.Multer.File;

    await expect(
      service.analyze(
        file,
        { target: 'students', classroomId: 'class-B' },
        { userId: 'u', email: 'a@test.com', role: 'TEACHER', teacherId: 'teacher-A' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
