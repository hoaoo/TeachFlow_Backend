import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { GeminiProvider } from './providers/gemini.provider';
import { AnalyzeImportDto } from './dto/analyze-import.dto';
import {
  GeneratedLessonPlanOutputDto,
  GeneratedWorksheetOutputDto,
  ImportStudentsOutputDto,
} from './dto/generated-outputs.dto';
import { validateAiOutput } from './validation/validate-ai-output';
import { importStudentsSchema } from './schemas/import.schema';
import { lessonPlanSchema } from './schemas/lesson-plan.schema';
import { worksheetSchema } from './schemas/worksheet.schema';
import {
  buildImportLessonPlanPrompt,
  buildImportStudentsPrompt,
  buildImportWorksheetPrompt,
} from './prompts/import.prompt';
import {
  IMPORT_ALLOWED_EXTENSIONS,
  validateUploadedFile,
} from '../resources/resources.validator';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

export interface ImportStudentPreviewRow {
  fullName: string;
  studentCode?: string;
  gender?: string;
  dob?: string;
  parentName?: string;
  parentPhone?: string;
  note?: string;
  valid: boolean;
  errors: string[];
}

@Injectable()
export class ImportAiService {
  private readonly logger = new Logger(ImportAiService.name);

  constructor(
    private readonly provider: GeminiProvider,
    private readonly configService: ConfigService,
    private readonly classroomAccess: TeachingAssignmentAuthorizationService,
  ) {}

  async analyze(file: Express.Multer.File, dto: AnalyzeImportDto, user: AuthenticatedUser) {
    const maxSizeMb =
      parseInt(
        this.configService.get<string>('IMPORT_MAX_FILE_SIZE_MB') ||
          process.env.IMPORT_MAX_FILE_SIZE_MB ||
          '10',
        10,
      ) || 10;

    const validation = validateUploadedFile(file, maxSizeMb, IMPORT_ALLOWED_EXTENSIONS);
    const ext = validation.extension;

    if (dto.classroomId && user.teacherId) {
      await this.classroomAccess.assertTeacherCanAccessClassroom(dto.classroomId, user.teacherId);
    }

    this.logger.log(
      `[AI] operation=import-analyze teacherId=${user.teacherId || 'unknown'} target=${dto.target} ext=${ext} size=${file.size} status=START`,
    );

    if (dto.target === 'students') {
      return this.analyzeStudents(file, ext, dto);
    }
    if (dto.target === 'lesson-plan') {
      return this.analyzeLessonPlan(file, ext, dto);
    }
    return this.analyzeWorksheet(file, ext, dto);
  }

  private async analyzeStudents(file: Express.Multer.File, ext: string, dto: AnalyzeImportDto) {
    let rows: ImportStudentPreviewRow[] = [];

    if (ext === '.xlsx' || ext === '.xls') {
      rows = this.parseSpreadsheetStudents(file.buffer);
    }

    if (rows.length === 0) {
      const extracted = await this.extractTextOrDescribe(file, ext);
      const aiResult = await this.provider.generateStructured<ImportStudentsOutputDto>({
        operation: 'import',
        prompt: buildImportStudentsPrompt(extracted.text, dto),
        schema: importStudentsSchema,
        inlineParts: extracted.inlinePart ? [extracted.inlinePart] : undefined,
        validate: (raw) => validateAiOutput(ImportStudentsOutputDto, raw),
      });
      rows = (aiResult.students || []).map((student) => this.validateStudentRow(student));
    }

    const validCount = rows.filter((row) => row.valid).length;
    return {
      target: 'students' as const,
      fileName: file.originalname,
      totalRows: rows.length,
      validCount,
      errorCount: rows.length - validCount,
      rows,
      persisted: false,
      message: 'AI chỉ đề xuất dữ liệu. Giáo viên cần xem trước và xác nhận trước khi lưu.',
    };
  }

  private async analyzeLessonPlan(file: Express.Multer.File, ext: string, dto: AnalyzeImportDto) {
    const extracted = await this.extractTextOrDescribe(file, ext);
    const result = await this.provider.generateStructured<GeneratedLessonPlanOutputDto>({
      operation: 'import',
      prompt: buildImportLessonPlanPrompt(extracted.text, dto),
      schema: lessonPlanSchema,
      inlineParts: extracted.inlinePart ? [extracted.inlinePart] : undefined,
      validate: (raw) => validateAiOutput(GeneratedLessonPlanOutputDto, raw),
    });
    return {
      target: 'lesson-plan' as const,
      fileName: file.originalname,
      draft: result,
      persisted: false,
      message: 'AI chỉ đề xuất dữ liệu. Giáo viên cần xem trước và xác nhận trước khi lưu.',
    };
  }

  private async analyzeWorksheet(file: Express.Multer.File, ext: string, dto: AnalyzeImportDto) {
    const extracted = await this.extractTextOrDescribe(file, ext);
    const result = await this.provider.generateStructured<GeneratedWorksheetOutputDto>({
      operation: 'import',
      prompt: buildImportWorksheetPrompt(extracted.text, dto),
      schema: worksheetSchema,
      inlineParts: extracted.inlinePart ? [extracted.inlinePart] : undefined,
      validate: (raw) => validateAiOutput(GeneratedWorksheetOutputDto, raw),
    });
    return {
      target: 'worksheet' as const,
      fileName: file.originalname,
      draft: result,
      persisted: false,
      message: 'AI chỉ đề xuất dữ liệu. Giáo viên cần xem trước và xác nhận trước khi lưu.',
    };
  }

  private parseSpreadsheetStudents(buffer: Buffer): ImportStudentPreviewRow[] {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return [];
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (!Array.isArray(json) || json.length === 0) return [];

      return json
        .map((row) => this.mapSpreadsheetRow(row))
        .filter((row) => row.fullName.trim() !== '')
        .map((row) => this.validateStudentRow(row));
    } catch {
      throw new BadRequestException('Không thể đọc tệp bảng tính. Vui lòng kiểm tra lại file Excel.');
    }
  }

  private mapSpreadsheetRow(row: Record<string, unknown>) {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[this.normalizeHeader(key)] = String(value ?? '').trim();
    }
    const values = Object.values(row).map((value) => String(value ?? '').trim());
    return {
      fullName: normalized.fullname || normalized.hoten || values[0] || '',
      studentCode: normalized.studentcode || normalized.mahs || normalized.ma || '',
      gender: normalized.gender || normalized.gioitinh || '',
      dob: normalized.dob || normalized.ngaysinh || '',
      parentName: normalized.parentname || normalized.phuhuynh || normalized.hotenphuhuynh || '',
      parentPhone: normalized.parentphone || normalized.sodienthoai || normalized.sdt || '',
      note: normalized.note || normalized.ghichu || '',
    };
  }

  private normalizeHeader(header: string): string {
    return header
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]/g, '');
  }

  private validateStudentRow(row: {
    fullName?: string;
    studentCode?: string;
    gender?: string;
    dob?: string;
    parentName?: string;
    parentPhone?: string;
    note?: string;
  }): ImportStudentPreviewRow {
    const errors: string[] = [];
    const fullName = (row.fullName || '').trim();
    if (!fullName) errors.push('Thiếu họ và tên');

    let dob = (row.dob || '').trim();
    if (dob && !this.isLikelyDate(dob)) {
      errors.push('Ngày sinh không hợp lệ');
    }

    let gender = (row.gender || '').trim();
    if (gender) {
      const g = gender.toLowerCase();
      if (['nu', 'nữ', 'female', 'f'].includes(g)) gender = 'Nữ';
      else if (['nam', 'male', 'm'].includes(g)) gender = 'Nam';
      else if (!['Nam', 'Nữ'].includes(gender)) errors.push('Giới tính không hợp lệ');
    }

    return {
      fullName,
      studentCode: row.studentCode?.trim() || undefined,
      gender: gender || undefined,
      dob: dob || undefined,
      parentName: row.parentName?.trim() || undefined,
      parentPhone: row.parentPhone?.trim() || undefined,
      note: row.note?.trim() || undefined,
      valid: errors.length === 0,
      errors,
    };
  }

  private isLikelyDate(value: string): boolean {
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(value)) return true;
    if (!Number.isNaN(Date.parse(value))) return true;
    return false;
  }

  private async extractTextOrDescribe(file: Express.Multer.File, ext: string) {
    const maxChars = this.provider.getMaxInputChars();
    if (['.png', '.jpg', '.jpeg'].includes(ext)) {
      return {
        text: `Tệp ảnh ${path.basename(file.originalname || 'image')}. Hãy OCR và trích xuất dữ liệu.`,
        inlinePart: {
          mimeType: ext === '.png' ? 'image/png' : 'image/jpeg',
          data: file.buffer.toString('base64'),
        },
      };
    }

    if (ext === '.pdf' || ext === '.docx') {
      const text = this.extractUtf8Snippet(file.buffer, maxChars);
      return {
        text: text || `Tệp ${ext} ${path.basename(file.originalname || 'document')}. Hãy đọc nội dung và trích xuất dữ liệu có cấu trúc.`,
        inlinePart: {
          mimeType:
            ext === '.pdf'
              ? 'application/pdf'
              : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          data: file.buffer.toString('base64'),
        },
      };
    }

    const text = this.extractUtf8Snippet(file.buffer, maxChars);
    return { text: text || 'Không trích xuất được văn bản từ tệp.', inlinePart: undefined };
  }

  private extractUtf8Snippet(buffer: Buffer, maxChars: number): string {
    const text = buffer
      .toString('utf8')
      .replace(/\u0000/g, ' ')
      .replace(/[^\S\n]+/g, ' ')
      .trim();
    if (!text) return '';
    return text.slice(0, maxChars);
  }
}
