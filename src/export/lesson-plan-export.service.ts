import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  HeightRule,
} from 'docx';

const pdfMake = require('pdfmake');

export interface LessonPlanExportData {
  id: string;
  title: string;
  subjectName?: string | null;
  gradeName?: string | null;
  weekNumber?: number | null;
  periodNumber?: number | null;
  teachingDate?: Date | null;
  durationMinutes?: number;
  objectives?: string | null;
  teachingEquipment?: string | null;
  postLessonAdjustment?: string | null;
  teacherName?: string | null;
  activities: Array<{
    id: string;
    phase: string;
    title: string;
    durationMinutes: number;
    method?: string | null;
    technique?: string | null;
    competencies?: string | null;
    qualities?: string | null;
    objective?: string | null;
    teacherActivity?: string | null;
    studentActivity?: string | null;
    sortOrder: number;
  }>;
}

@Injectable()
export class LessonPlanExportService {
  private readonly logger = new Logger(LessonPlanExportService.name);

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

  /**
   * Generate native Microsoft Word (.docx) document
   */
  async generateDocx(data: LessonPlanExportData): Promise<Buffer> {
    const formattedDate = data.teachingDate
      ? new Date(data.teachingDate).toLocaleDateString('vi-VN')
      : '.../.../2026';

    const children: any[] = [];

    // Header Title
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: 'KẾ HOẠCH BÀI DẠY',
            bold: true,
            size: 32, // 16pt
            color: '0F172A',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [
          new TextRun({
            text: `BÀI: ${data.title.toUpperCase()}`,
            bold: true,
            size: 26, // 13pt
            color: '0D9488',
          }),
        ],
      }),
    );

    // Metadata block
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: 'Môn học: ', bold: true, size: 22 }),
          new TextRun({ text: `${data.subjectName || 'Toán'}`, size: 22 }),
          new TextRun({ text: '          Lớp: ', bold: true, size: 22 }),
          new TextRun({ text: `${data.gradeName || 'Khối 4'}`, size: 22 }),
        ],
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: 'Tuần: ', bold: true, size: 22 }),
          new TextRun({ text: `${data.weekNumber || 1}`, size: 22 }),
          new TextRun({ text: '          Tiết: ', bold: true, size: 22 }),
          new TextRun({ text: `${data.periodNumber || 1}`, size: 22 }),
          new TextRun({ text: '          Thời lượng: ', bold: true, size: 22 }),
          new TextRun({ text: `${data.durationMinutes || 40} phút`, size: 22 }),
        ],
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({ text: 'Ngày dạy: ', bold: true, size: 22 }),
          new TextRun({ text: `${formattedDate}`, size: 22 }),
          new TextRun({ text: '          Giáo viên: ', bold: true, size: 22 }),
          new TextRun({ text: `${data.teacherName || 'Nguyễn Thị Mai'}`, size: 22 }),
        ],
      }),
    );

    // Section I: Yêu cầu cần đạt
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({
            text: 'I. YÊU CẦU CẦN ĐẠT',
            bold: true,
            size: 24,
            color: '0F172A',
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 160 },
        children: [
          new TextRun({
            text: data.objectives || 'Phát triển năng lực và phẩm chất theo chuẩn kiến thức kỹ năng môn học.',
            size: 22,
          }),
        ],
      }),
    );

    // Section II: Đồ dùng dạy học
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({
            text: 'II. ĐỒ DÙNG DẠY HỌC',
            bold: true,
            size: 24,
            color: '0F172A',
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: data.teachingEquipment || '- Giáo viên: Máy chiếu, bài giảng điện tử, phiếu học tập.\n- Học sinh: SGK, vở ghi, đồ dùng học tập.',
            size: 22,
          }),
        ],
      }),
    );

    // Section III: Các hoạt động dạy học
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 140 },
        children: [
          new TextRun({
            text: 'III. CÁC HOẠT ĐỘNG DẠY HỌC CHỦ YẾU',
            bold: true,
            size: 24,
            color: '0F172A',
          }),
        ],
      }),
    );

    // Sort activities by sortOrder
    const sortedActivities = [...(data.activities || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    sortedActivities.forEach((act, index) => {
      // Activity title & metadata
      children.push(
        new Paragraph({
          spacing: { before: 180, after: 60 },
          children: [
            new TextRun({
              text: `${index + 1}. ${act.phase}: ${act.title}`,
              bold: true,
              size: 23,
              color: '0D9488',
            }),
            new TextRun({
              text: ` (${act.durationMinutes || 5} phút)`,
              italics: true,
              size: 21,
              color: '64748B',
            }),
          ],
        }),
      );

      if (act.objective) {
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: '• Mục tiêu: ', bold: true, size: 21 }),
              new TextRun({ text: act.objective, size: 21 }),
            ],
          }),
        );
      }

      if (act.method || act.technique || act.competencies || act.qualities) {
        const metaParts = [
          act.method ? `PP: ${act.method}` : null,
          act.technique ? `KT: ${act.technique}` : null,
          act.competencies ? `NL: ${act.competencies}` : null,
          act.qualities ? `PC: ${act.qualities}` : null,
        ].filter(Boolean);

        children.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: `• ${metaParts.join(' | ')}`,
                italics: true,
                size: 20,
                color: '475569',
              }),
            ],
          }),
        );
      }

      // 2-Column Table for Teacher and Student activities
      const teacherParagraphs = (act.teacherActivity || 'GV hướng dẫn và giao nhiệm vụ.')
        .split('\n')
        .map((line) => new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: line, size: 21 })] }));

      const studentParagraphs = (act.studentActivity || 'HS lắng nghe và thực hiện nhiệm vụ.')
        .split('\n')
        .map((line) => new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: line, size: 21 })] }));

      const activityTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          // Table Header
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                shading: { fill: 'F1F5F9' },
                margins: { top: 120, bottom: 120, left: 140, right: 140 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: 'Hoạt động của giáo viên', bold: true, size: 21, color: '1E293B' })],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                shading: { fill: 'F1F5F9' },
                margins: { top: 120, bottom: 120, left: 140, right: 140 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: 'Hoạt động của học sinh', bold: true, size: 21, color: '1E293B' })],
                  }),
                ],
              }),
            ],
          }),
          // Content Row
          new TableRow({
            children: [
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                margins: { top: 120, bottom: 120, left: 140, right: 140 },
                children: teacherParagraphs,
              }),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                margins: { top: 120, bottom: 120, left: 140, right: 140 },
                children: studentParagraphs,
              }),
            ],
          }),
        ],
      });

      children.push(activityTable);
      children.push(new Paragraph({ spacing: { after: 120 } }));
    });

    // Section IV: Điều chỉnh sau bài dạy
    children.push(
      new Paragraph({
        spacing: { before: 240, after: 100 },
        children: [
          new TextRun({
            text: 'IV. ĐIỀU CHỈNH SAU BÀI DẠY',
            bold: true,
            size: 24,
            color: '0F172A',
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: data.postLessonAdjustment || '........................................................................................................................................................................................................................................................................................................................................................................',
            size: 21,
            italics: !data.postLessonAdjustment,
          }),
        ],
      }),
    );

    const doc = new Document({
      creator: 'TeachFlow Assistant',
      title: data.title,
      description: `Kế hoạch bài dạy môn ${data.subjectName || ''}`,
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440, // 1 inch = 1440 twips
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
   * Generate PDF document with proper Vietnamese Unicode support via pdfMake
   */
  async generatePdf(data: LessonPlanExportData): Promise<Buffer> {
    const formattedDate = data.teachingDate
      ? new Date(data.teachingDate).toLocaleDateString('vi-VN')
      : '.../.../2026';

    const sortedActivities = [...(data.activities || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const content: any[] = [
      { text: 'KẾ HOẠCH BÀI DẠY', fontSize: 16, bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
      { text: `BÀI: ${data.title.toUpperCase()}`, fontSize: 13, bold: true, color: '#0d9488', alignment: 'center', margin: [0, 0, 0, 14] },
      {
        columns: [
          { text: [{ text: 'Môn học: ', bold: true }, data.subjectName || 'Toán'] },
          { text: [{ text: 'Lớp: ', bold: true }, data.gradeName || 'Khối 4'] },
        ],
        margin: [0, 0, 0, 4],
        fontSize: 10.5,
      },
      {
        columns: [
          { text: [{ text: 'Tuần: ', bold: true }, String(data.weekNumber || 1)] },
          { text: [{ text: 'Tiết: ', bold: true }, String(data.periodNumber || 1)] },
          { text: [{ text: 'Thời lượng: ', bold: true }, `${data.durationMinutes || 40} phút`] },
        ],
        margin: [0, 0, 0, 4],
        fontSize: 10.5,
      },
      {
        columns: [
          { text: [{ text: 'Ngày dạy: ', bold: true }, formattedDate] },
          { text: [{ text: 'Giáo viên: ', bold: true }, data.teacherName || 'Nguyễn Thị Mai'] },
        ],
        margin: [0, 0, 0, 12],
        fontSize: 10.5,
      },
      { text: 'I. YÊU CẦU CẦN ĐẠT', fontSize: 12, bold: true, margin: [0, 8, 0, 4] },
      { text: data.objectives || 'Phát triển phẩm chất và năng lực học sinh.', fontSize: 10.5, lineHeight: 1.3, margin: [0, 0, 0, 10] },
      { text: 'II. ĐỒ DÙNG DẠY HỌC', fontSize: 12, bold: true, margin: [0, 8, 0, 4] },
      { text: data.teachingEquipment || '- Giáo viên: Máy chiếu, bài giảng, phiếu bài.\n- Học sinh: SGK, vở ghi, đồ dùng học tập.', fontSize: 10.5, lineHeight: 1.3, margin: [0, 0, 0, 12] },
      { text: 'III. CÁC HOẠT ĐỘNG DẠY HỌC CHỦ YẾU', fontSize: 12, bold: true, margin: [0, 8, 0, 8] },
    ];

    sortedActivities.forEach((act, idx) => {
      content.push({
        text: [
          { text: `${idx + 1}. ${act.phase}: ${act.title}`, bold: true, color: '#0d9488' },
          { text: ` (${act.durationMinutes || 5} phút)`, italics: true, color: '#64748b' },
        ],
        fontSize: 11,
        margin: [0, 8, 0, 3],
      });

      if (act.objective) {
        content.push({
          text: [{ text: '• Mục tiêu: ', bold: true }, act.objective],
          fontSize: 10,
          margin: [0, 0, 0, 3],
        });
      }

      if (act.method || act.technique || act.competencies || act.qualities) {
        const meta = [
          act.method ? `PP: ${act.method}` : null,
          act.technique ? `KT: ${act.technique}` : null,
          act.competencies ? `NL: ${act.competencies}` : null,
          act.qualities ? `PC: ${act.qualities}` : null,
        ].filter(Boolean).join(' | ');

        content.push({
          text: `• ${meta}`,
          fontSize: 9.5,
          italics: true,
          color: '#475569',
          margin: [0, 0, 0, 6],
        });
      }

      // 2-column Table
      content.push({
        table: {
          headerRows: 1,
          widths: ['50%', '50%'],
          body: [
            [
              { text: 'Hoạt động của giáo viên', bold: true, alignment: 'center', fillColor: '#f1f5f9', fontSize: 10 },
              { text: 'Hoạt động của học sinh', bold: true, alignment: 'center', fillColor: '#f1f5f9', fontSize: 10 },
            ],
            [
              { text: act.teacherActivity || 'GV hướng dẫn thực hiện.', fontSize: 9.5, lineHeight: 1.25, margin: [2, 4, 2, 4] },
              { text: act.studentActivity || 'HS tham gia hoạt động.', fontSize: 9.5, lineHeight: 1.25, margin: [2, 4, 2, 4] },
            ],
          ],
        },
        margin: [0, 2, 0, 10],
      });
    });

    content.push(
      { text: 'IV. ĐIỀU CHỈNH SAU BÀI DẠY', fontSize: 12, bold: true, margin: [0, 12, 0, 4] },
      { text: data.postLessonAdjustment || '........................................................................................................................................................................................................................................................................................................................................................................', fontSize: 10, italics: !data.postLessonAdjustment, margin: [0, 0, 0, 10] },
    );

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
