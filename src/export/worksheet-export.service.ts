import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
} from 'docx';

const pdfMake = require('pdfmake');

export interface WorksheetQuestionExportData {
  id: string;
  questionType: string;
  content: string;
  optionsJson?: any;
  correctAnswerJson?: any;
  explanation?: string | null;
  sortOrder: number;
}

export interface WorksheetExportData {
  id: string;
  title: string;
  subtitle?: string | null;
  subjectName?: string | null;
  gradeName?: string | null;
  lessonTitle?: string | null;
  teacherName?: string | null;
  questions: WorksheetQuestionExportData[];
}

@Injectable()
export class WorksheetExportService {
  private readonly logger = new Logger(WorksheetExportService.name);

  constructor() {
    this.initPdfMakeFonts();
  }

  private initPdfMakeFonts() {
    try {
      const robotoDir = path.join(path.dirname(require.resolve('pdfmake/package.json')), 'fonts', 'Roboto');
      pdfMake.setFonts({
        Roboto: {
          normal: path.join(robotoDir, 'Roboto-Regular.ttf'),
          bold: path.join(robotoDir, 'Roboto-Medium.ttf'),
          italics: path.join(robotoDir, 'Roboto-Italic.ttf'),
          bolditalics: path.join(robotoDir, 'Roboto-MediumItalic.ttf'),
        },
      });
      pdfMake.setUrlAccessPolicy(() => false);
      pdfMake.setLocalAccessPolicy((filePath: string) => filePath.startsWith(robotoDir));
    } catch (err: any) {
      this.logger.error('Failed to configure pdfMake fonts', err?.message);
    }
  }

  private getOptions(question: WorksheetQuestionExportData): string[] {
    if (!question.optionsJson) return [];
    if (Array.isArray(question.optionsJson)) {
      return question.optionsJson.map((opt) => String(opt));
    }
    if (typeof question.optionsJson === 'object') {
      return Object.values(question.optionsJson).map((v) => String(v));
    }
    return [];
  }

  private getAnswerText(question: WorksheetQuestionExportData): string {
    if (!question.correctAnswerJson) return '';
    if (typeof question.correctAnswerJson === 'string') return question.correctAnswerJson;
    if (Array.isArray(question.correctAnswerJson)) return question.correctAnswerJson.join(', ');
    return JSON.stringify(question.correctAnswerJson);
  }

  private getQuestionTypeLabel(type: string): string {
    const map: Record<string, string> = {
      MULTIPLE_CHOICE: 'Trắc nghiệm',
      TRUE_FALSE: 'Đúng / Sai',
      FILL_BLANK: 'Điền khuyết',
      MATCHING: 'Nối cột',
      ESSAY: 'Tự luận',
    };
    return map[type] || 'Câu hỏi';
  }

  /**
   * Generate Word (.docx) document for worksheet
   */
  async generateDocx(data: WorksheetExportData, includeAnswers = false): Promise<Buffer> {
    const children: any[] = [];

    // Header Title
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: 'PHIẾU HỌC TẬP',
            bold: true,
            size: 32, // 16pt
            color: '0F172A',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: data.title.toUpperCase(),
            bold: true,
            size: 26,
            color: '0D9488',
          }),
        ],
      }),
    );

    // Metadata
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: 'Môn: ', bold: true, size: 22 }),
          new TextRun({ text: `${data.subjectName || 'Toán'}`, size: 22 }),
          new TextRun({ text: '          Khối: ', bold: true, size: 22 }),
          new TextRun({ text: `${data.gradeName || 'Lớp 4'}`, size: 22 }),
          new TextRun({ text: '          Bài học: ', bold: true, size: 22 }),
          new TextRun({ text: `${data.lessonTitle || data.title}`, size: 22 }),
        ],
      }),
      new Paragraph({
        spacing: { after: 240 },
        children: [
          new TextRun({ text: 'Họ và tên học sinh: ', bold: true, size: 22 }),
          new TextRun({ text: '................................................................................', size: 22 }),
          new TextRun({ text: '   Lớp: ', bold: true, size: 22 }),
          new TextRun({ text: '..............', size: 22 }),
        ],
      }),
      new Paragraph({
        spacing: { before: 140, after: 180 },
        children: [
          new TextRun({
            text: 'I. NỘI DUNG CÂU HỎI',
            bold: true,
            size: 24,
            color: '0F172A',
          }),
        ],
      }),
    );

    const sortedQuestions = [...(data.questions || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    sortedQuestions.forEach((q, idx) => {
      const typeLabel = this.getQuestionTypeLabel(q.questionType);
      children.push(
        new Paragraph({
          spacing: { before: 140, after: 80 },
          children: [
            new TextRun({
              text: `Câu ${idx + 1} (${typeLabel}): `,
              bold: true,
              size: 22,
              color: '0D9488',
            }),
            new TextRun({
              text: q.content,
              size: 22,
            }),
          ],
        }),
      );

      const options = this.getOptions(q);
      if (options.length > 0) {
        options.forEach((opt, optIdx) => {
          const prefix = String.fromCharCode(65 + optIdx); // A, B, C, D
          const text = opt.startsWith(`${prefix}.`) ? opt : `${prefix}. ${opt}`;
          children.push(
            new Paragraph({
              indent: { left: 400 },
              spacing: { after: 40 },
              children: [new TextRun({ text, size: 21 })],
            }),
          );
        });
      } else if (q.questionType === 'ESSAY' || q.questionType === 'FILL_BLANK') {
        children.push(
          new Paragraph({
            indent: { left: 400 },
            spacing: { before: 60, after: 60 },
            children: [
              new TextRun({
                text: 'Trả lời: ............................................................................................................................................................................',
                size: 21,
                color: '64748B',
              }),
            ],
          }),
        );
      }
    });

    // Optional Answers Section
    if (includeAnswers) {
      children.push(
        new Paragraph({
          spacing: { before: 360, after: 160 },
          children: [
            new TextRun({
              text: 'II. ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM',
              bold: true,
              size: 24,
              color: '0F172A',
            }),
          ],
        }),
      );

      sortedQuestions.forEach((q, idx) => {
        const ans = this.getAnswerText(q);
        children.push(
          new Paragraph({
            spacing: { before: 80, after: 40 },
            children: [
              new TextRun({
                text: `Câu ${idx + 1}: `,
                bold: true,
                size: 21,
                color: '0D9488',
              }),
              new TextRun({
                text: ans || 'Theo hướng dẫn của giáo viên',
                bold: true,
                size: 21,
              }),
            ],
          }),
        );

        if (q.explanation) {
          children.push(
            new Paragraph({
              indent: { left: 400 },
              spacing: { after: 80 },
              children: [
                new TextRun({
                  text: `Giải thích: ${q.explanation}`,
                  italics: true,
                  size: 20,
                  color: '475569',
                }),
              ],
            }),
          );
        }
      });
    }

    const doc = new Document({
      creator: 'TeachFlow Assistant',
      title: data.title,
      description: `Phiếu học tập môn ${data.subjectName || ''}`,
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440,
                bottom: 1440,
                left: 1440,
                right: 1440,
              },
            },
          },
          children,
        },
      ],
    });

    return await Packer.toBuffer(doc);
  }

  /**
   * Generate PDF document for worksheet
   */
  async generatePdf(data: WorksheetExportData, includeAnswers = false): Promise<Buffer> {
    const sortedQuestions = [...(data.questions || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const content: any[] = [
      { text: 'PHIẾU HỌC TẬP', fontSize: 16, bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
      { text: data.title.toUpperCase(), fontSize: 13, bold: true, color: '#0d9488', alignment: 'center', margin: [0, 0, 0, 14] },
      {
        columns: [
          { text: [{ text: 'Môn: ', bold: true }, data.subjectName || 'Toán'] },
          { text: [{ text: 'Khối: ', bold: true }, data.gradeName || 'Lớp 4'] },
          { text: [{ text: 'Bài học: ', bold: true }, data.lessonTitle || data.title] },
        ],
        margin: [0, 0, 0, 8],
        fontSize: 10.5,
      },
      {
        text: [
          { text: 'Họ và tên học sinh: ', bold: true },
          '....................................................................................   ',
          { text: 'Lớp: ', bold: true },
          '..................',
        ],
        margin: [0, 0, 0, 14],
        fontSize: 10.5,
      },
      { text: 'I. NỘI DUNG CÂU HỎI', fontSize: 12, bold: true, margin: [0, 6, 0, 8] },
    ];

    sortedQuestions.forEach((q, idx) => {
      const typeLabel = this.getQuestionTypeLabel(q.questionType);
      content.push({
        text: [
          { text: `Câu ${idx + 1} (${typeLabel}): `, bold: true, color: '#0d9488' },
          q.content,
        ],
        fontSize: 10.5,
        lineHeight: 1.25,
        margin: [0, 6, 0, 4],
      });

      const options = this.getOptions(q);
      if (options.length > 0) {
        options.forEach((opt, optIdx) => {
          const prefix = String.fromCharCode(65 + optIdx);
          const text = opt.startsWith(`${prefix}.`) ? opt : `${prefix}. ${opt}`;
          content.push({
            text,
            fontSize: 10,
            margin: [16, 1, 0, 2],
          });
        });
      } else if (q.questionType === 'ESSAY' || q.questionType === 'FILL_BLANK') {
        content.push({
          text: 'Trả lời: ............................................................................................................................................................',
          fontSize: 10,
          color: '#64748b',
          margin: [16, 4, 0, 6],
        });
      }
    });

    if (includeAnswers) {
      content.push(
        { text: 'II. ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM', fontSize: 12, bold: true, margin: [0, 16, 0, 8] },
      );

      sortedQuestions.forEach((q, idx) => {
        const ans = this.getAnswerText(q);
        content.push({
          text: [
            { text: `Câu ${idx + 1}: `, bold: true, color: '#0d9488' },
            { text: ans || 'Theo hướng dẫn của giáo viên', bold: true },
          ],
          fontSize: 10,
          margin: [0, 3, 0, 2],
        });

        if (q.explanation) {
          content.push({
            text: `Giải thích: ${q.explanation}`,
            fontSize: 9.5,
            italics: true,
            color: '#475569',
            margin: [16, 0, 0, 4],
          });
        }
      });
    }

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 40],
      content,
      defaultStyle: {
        font: 'Roboto',
      },
    };

    const doc = pdfMake.createPdf(docDefinition);
    return await doc.getBuffer();
  }
}
