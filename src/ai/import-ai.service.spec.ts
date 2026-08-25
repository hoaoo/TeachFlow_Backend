import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, Table, TableRow, TableCell } from 'docx';
import { ImportAiService } from './import-ai.service';
import { GeminiProvider } from './providers/gemini.provider';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';

function makeXlsx(rows: Record<string, string>[]): Buffer {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

async function makeDocxTable(headers: string[], rows: string[][]): Promise<Buffer> {
  const tableRows = [
    new TableRow({
      children: headers.map((h) => new TableCell({ children: [new Paragraph(h)] })),
    }),
    ...rows.map(
      (r) =>
        new TableRow({
          children: r.map((cell) => new TableCell({ children: [new Paragraph(cell)] })),
        }),
    ),
  ];

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph('DANH SÁCH HỌC SINH LỚP'),
          new Table({ rows: tableRows }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

async function makeDocxUnstructured(text: string): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: text.split('\n').map((line) => new Paragraph(line)),
      },
    ],
  });
  return Packer.toBuffer(doc);
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

  it('parses DOCX with standard table deterministically without calling AI', async () => {
    const buffer = await makeDocxTable(
      ['STT', 'Họ và tên', 'Mã HS', 'Giới tính', 'Ngày sinh', 'Phụ huynh', 'Số điện thoại'],
      [
        ['1', 'Nguyễn Văn An', 'HS001', 'Nam', '12/05/2018', 'Nguyễn Văn Ba', '0901234567'],
        ['2', 'Trần Thị Bình', 'HS002', 'Nữ', '20/08/2018', 'Trần Văn Cường', '0987654321'],
      ],
    );
    const file = {
      originalname: 'danh_sach_lop.docx',
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: buffer.length,
      buffer,
    } as Express.Multer.File;

    const result = await service.analyze(file, { target: 'students' }, { userId: 'u', email: 'a@test.com', role: 'TEACHER', teacherId: 't1' });

    expect(result.persisted).toBe(false);
    expect(result.target).toBe('students');
    if (result.target !== 'students') throw new Error('expected students import');
    expect(result.totalRows).toBe(2);
    expect(result.validCount).toBe(2);
    expect(result.errorCount).toBe(0);
    expect(result.rows[0].fullName).toBe('Nguyễn Văn An');
    expect(result.rows[0].studentCode).toBe('HS001');
    expect(result.rows[0].dob).toBe('12/05/2018');
    expect(result.rows[0].gender).toBe('Nam');
    expect(result.rows[1].fullName).toBe('Trần Thị Bình');
    expect(result.rows[1].gender).toBe('Nữ');
    expect(mockProvider.generateStructured).not.toHaveBeenCalled();
  });

  it('parses DOCX with alternative header aliases and flags extra columns in unmappedColumns without schema crash', async () => {
    const buffer = await makeDocxTable(
      ['TT', 'Họ tên học sinh', 'Mã số', 'Phái', 'Năm sinh', 'Người giám hộ', 'SĐT liên hệ', 'Địa chỉ thường trú'],
      [
        ['1', 'Lê Hoàng Long', 'HS100', 'Nam', '15/09/2018', 'Lê Văn Hùng', '0912345678', 'Hà Nội'],
      ],
    );
    const file = {
      originalname: 'danh_sach_2.docx',
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: buffer.length,
      buffer,
    } as Express.Multer.File;

    const result = await service.analyze(file, { target: 'students' }, { userId: 'u', email: 'a@test.com', role: 'TEACHER', teacherId: 't1' });

    if (result.target !== 'students') throw new Error('expected students import');
    expect(result.totalRows).toBe(1);
    expect(result.validCount).toBe(1);
    expect(result.rows[0].fullName).toBe('Lê Hoàng Long');
    expect(result.rows[0].studentCode).toBe('HS100');
    expect(result.rows[0].parentName).toBe('Lê Văn Hùng');
    expect(result.rows[0].unmappedColumns).toBeDefined();
    expect(result.rows[0].unmappedColumns?.['Địa chỉ thường trú']).toBe('Hà Nội');
    expect(mockProvider.generateStructured).not.toHaveBeenCalled();
  });

  it('flags invalid dates and invalid genders as invalid rows with error details', async () => {
    const buffer = await makeDocxTable(
      ['Họ và tên', 'Ngày sinh', 'Giới tính'],
      [
        ['Học Sinh 1', '???', 'Nam'],
        ['Học Sinh 2', '12/05/2018', 'khong-xac-dinh'],
      ],
    );
    const file = {
      originalname: 'invalid_data.docx',
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: buffer.length,
      buffer,
    } as Express.Multer.File;

    const result = await service.analyze(file, { target: 'students' }, { userId: 'u', email: 'a@test.com', role: 'TEACHER', teacherId: 't1' });

    if (result.target !== 'students') throw new Error('expected students import');
    expect(result.totalRows).toBe(2);
    expect(result.validCount).toBe(0);
    expect(result.errorCount).toBe(2);
    expect(result.rows[0].valid).toBe(false);
    expect(result.rows[0].errors.some((e) => e.includes('Ngày sinh'))).toBe(true);
    expect(result.rows[1].valid).toBe(false);
    expect(result.rows[1].errors.some((e) => e.includes('Giới tính'))).toBe(true);
  });

  it('extracts unstructured DOCX text and uses Gemini structured AI extraction', async () => {
    const unstructuredText = `Danh sách học sinh lớp 1B năm học 2026-2027:
1. Em Phạm Gia Huy, sinh ngày 05/11/2018, nam. Phụ huynh là Phạm Văn Toàn sđt 0933112233.
2. Em Hoàng Thùy Linh, sinh ngày 22/02/2018, nữ.`;

    const buffer = await makeDocxUnstructured(unstructuredText);
    const file = {
      originalname: 'unstructured.docx',
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: buffer.length,
      buffer,
    } as Express.Multer.File;

    mockProvider.generateStructured.mockResolvedValueOnce({
      students: [
        { fullName: 'Phạm Gia Huy', dob: '05/11/2018', gender: 'Nam', parentName: 'Phạm Văn Toàn', parentPhone: '0933112233' },
        { fullName: 'Hoàng Thùy Linh', dob: '22/02/2018', gender: 'Nữ' },
      ],
    });

    const result = await service.analyze(file, { target: 'students' }, { userId: 'u', email: 'a@test.com', role: 'TEACHER', teacherId: 't1' });

    expect(mockProvider.generateStructured).toHaveBeenCalled();
    if (result.target !== 'students') throw new Error('expected students import');
    expect(result.totalRows).toBe(2);
    expect(result.validCount).toBe(2);
    expect(result.rows[0].fullName).toBe('Phạm Gia Huy');
    expect(result.rows[1].fullName).toBe('Hoàng Thùy Linh');
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
