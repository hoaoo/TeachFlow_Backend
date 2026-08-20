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
  HeightRule,
} from 'docx';

const pdfMake = require('pdfmake');

export interface WeeklyReviewExportData {
  className: string;
  gradeName: string;
  schoolYearName: string;
  weekNumber: number;
  teacherName: string;
  dateRange?: string;
  attendance: {
    totalStudents: number;
    presentRate: number;
    excusedAbsence: number;
    unexcusedAbsence: number;
    late: number;
  };
  learning: {
    excellent: number;
    completed: number;
    needsSupport: number;
  };
  behavior: {
    positive: number;
    reminder: number;
    needsAttention: number;
  };
  studentsNeedAttention: Array<{
    name: string;
    reasons: string[];
  }>;
  strengths?: string | null;
  limitations?: string | null;
  nextWeekPlan?: string | null;
}

export interface MonthlySummaryExportData {
  className: string;
  gradeName: string;
  schoolYearName: string;
  year: number;
  month: number;
  teacherName: string;
  attendance: {
    totalStudents: number;
    totalSchoolDays: number;
    attendanceRate: number;
    excusedAbsence: number;
    unexcusedAbsence: number;
    late: number;
  };
  learning: {
    excellent: number;
    completed: number;
    needsSupport: number;
  };
  behavior: {
    positive: number;
    reminder: number;
    needsAttention: number;
  };
  studentsImproved: Array<{ name: string; note: string }>;
  studentsNeedingSupport: Array<{ name: string; reasons: string[] }>;
  highlights?: string | null;
  limitations?: string | null;
  nextMonthPlan?: string | null;
}

@Injectable()
export class HomeroomExportService {
  private readonly logger = new Logger(HomeroomExportService.name);

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
   * Generate Word (.docx) for Weekly Review
   */
  async generateWeeklyReviewDocx(data: WeeklyReviewExportData): Promise<Buffer> {
    const children: any[] = [];

    // Header Title
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: 'BÁO CÁO CÔNG TÁC CHỦ NHIỆM TUẦN',
            bold: true,
            size: 32, // 16pt
            font: 'Times New Roman',
            color: '0D9488',
          }),
        ],
      }),
    );

    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: `Lớp: ${data.className}  |  Tuần: ${data.weekNumber}  |  Năm học: ${data.schoolYearName}  |  GVCN: ${data.teacherName}`,
            italics: true,
            size: 22,
            font: 'Times New Roman',
            color: '475569',
          }),
        ],
      }),
    );

    // Helper for section headings
    const addSectionHeader = (title: string) => {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 80 },
          children: [
            new TextRun({
              text: title,
              bold: true,
              size: 24, // 12pt
              font: 'Times New Roman',
              color: '0F766E',
            }),
          ],
        }),
      );
    };

    // Helper for content paragraphs
    const addParagraph = (text: string, isItalic = false) => {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({
              text,
              italics: isItalic,
              size: 22,
              font: 'Times New Roman',
            }),
          ],
        }),
      );
    };

    // I. Chuyên cần
    addSectionHeader('I. CHUYÊN CẦN');
    addParagraph(
      `• Tổng số học sinh: ${data.attendance.totalStudents}  |  Tỷ lệ chuyên cần trung bình: ${data.attendance.presentRate}%`,
    );
    addParagraph(
      `• Nghỉ có phép: ${data.attendance.excusedAbsence} lượt  |  Nghỉ không phép: ${data.attendance.unexcusedAbsence} lượt  |  Đi muộn: ${data.attendance.late} lượt`,
    );

    // II. Học tập
    addSectionHeader('II. TÌNH HÌNH HỌC TẬP');
    addParagraph(
      `• Hoàn thành tốt: ${data.learning.excellent} học sinh  |  Hoàn thành: ${data.learning.completed} học sinh  |  Cần hỗ trợ: ${data.learning.needsSupport} học sinh`,
    );

    // III. Nề nếp
    addSectionHeader('III. NỀ NẾP & Ý THỨC KỶ LUẬT');
    addParagraph(
      `• Ghi nhận tích cực: ${data.behavior.positive} lượt  |  Cần nhắc nhở: ${data.behavior.reminder} lượt  |  Cần quan tâm đặc biệt: ${data.behavior.needsAttention} lượt`,
    );

    // IV. Điểm nổi bật
    addSectionHeader('IV. ĐIỂM NỔI BẬT TRONG TUẦN');
    addParagraph(data.strengths?.trim() || 'Lớp duy trì nề nếp ổn định, tích cực tham gia các hoạt động.');

    // V. Hạn chế
    addSectionHeader('V. HẠN CHẾ CÒN TỒN TẠI');
    addParagraph(data.limitations?.trim() || 'Một số học sinh còn nói chuyện riêng trong giờ, cần tập trung hơn.');

    // VI. Học sinh cần hỗ trợ
    addSectionHeader('VI. DANH SÁCH HỌC SINH CẦN HỖ TRỢ');
    if (data.studentsNeedAttention.length > 0) {
      data.studentsNeedAttention.forEach((s, idx) => {
        addParagraph(`${idx + 1}. ${s.name}: ${s.reasons.join('; ')}`);
      });
    } else {
      addParagraph('Không có học sinh trong diện cần can thiệp đặc biệt tuần này.', true);
    }

    // VII. Kế hoạch tuần tới
    addSectionHeader('VII. KẾ HOẠCH TRỌNG TÂM TUẦN TỚI');
    addParagraph(data.nextWeekPlan?.trim() || 'Tiếp tục rèn luyện nề nếp học tập, chuẩn bị tốt cho các tiết dạy tuần tới.');

    // Signatures
    children.push(
      new Paragraph({
        spacing: { before: 300 },
        children: [
          new TextRun({
            text: '                                                                                  GIÁO VIÊN CHỦ NHIỆM',
            bold: true,
            size: 22,
            font: 'Times New Roman',
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { before: 500 },
        children: [
          new TextRun({
            text: `                                                                                  ${data.teacherName}`,
            bold: true,
            size: 22,
            font: 'Times New Roman',
          }),
        ],
      }),
    );

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }, // 2cm
            },
          },
          children,
        },
      ],
    });

    return Packer.toBuffer(doc);
  }

  /**
   * Generate PDF for Weekly Review
   */
  async generateWeeklyReviewPdf(data: WeeklyReviewExportData): Promise<Buffer> {
    const docDefinition: any = {
      content: [
        {
          text: 'BÁO CÁO CÔNG TÁC CHỦ NHIỆM TUẦN',
          style: 'header',
          alignment: 'center',
        },
        {
          text: `Lớp: ${data.className}  |  Tuần: ${data.weekNumber}  |  Năm học: ${data.schoolYearName}  |  GVCN: ${data.teacherName}`,
          style: 'subHeader',
          alignment: 'center',
          margin: [0, 0, 0, 15],
        },
        { text: 'I. CHUYÊN CẦN', style: 'sectionHeader' },
        {
          text: `• Tổng số học sinh: ${data.attendance.totalStudents}  |  Tỷ lệ chuyên cần: ${data.attendance.presentRate}%\n• Nghỉ có phép: ${data.attendance.excusedAbsence}  |  Nghỉ không phép: ${data.attendance.unexcusedAbsence}  |  Đi muộn: ${data.attendance.late}`,
          margin: [0, 0, 0, 8],
        },
        { text: 'II. TÌNH HÌNH HỌC TẬP', style: 'sectionHeader' },
        {
          text: `• Hoàn thành tốt: ${data.learning.excellent}  |  Hoàn thành: ${data.learning.completed}  |  Cần hỗ trợ: ${data.learning.needsSupport}`,
          margin: [0, 0, 0, 8],
        },
        { text: 'III. NỀ NẾP & Ý THỨC KỶ LUẬT', style: 'sectionHeader' },
        {
          text: `• Ghi nhận tích cực: ${data.behavior.positive}  |  Cần nhắc nhở: ${data.behavior.reminder}  |  Cần quan tâm: ${data.behavior.needsAttention}`,
          margin: [0, 0, 0, 8],
        },
        { text: 'IV. ĐIỂM NỔI BẬT TRONG TUẦN', style: 'sectionHeader' },
        { text: data.strengths?.trim() || 'Lớp duy trì nề nếp ổn định, tích cực tham gia các hoạt động.', margin: [0, 0, 0, 8] },
        { text: 'V. HẠN CHẾ CÒN TỒN TẠI', style: 'sectionHeader' },
        { text: data.limitations?.trim() || 'Một số học sinh còn nói chuyện riêng trong giờ.', margin: [0, 0, 0, 8] },
        { text: 'VI. DANH SÁCH HỌC SINH CẦN HỖ TRỢ', style: 'sectionHeader' },
        {
          ul:
            data.studentsNeedAttention.length > 0
              ? data.studentsNeedAttention.map((s) => `${s.name}: ${s.reasons.join('; ')}`)
              : ['Không có học sinh cần can thiệp đặc biệt tuần này.'],
          margin: [0, 0, 0, 8],
        },
        { text: 'VII. KẾ HOẠCH TRỌNG TÂM TUẦN TỚI', style: 'sectionHeader' },
        { text: data.nextWeekPlan?.trim() || 'Tiếp tục rèn luyện nề nếp, chuẩn bị bài chu đáo.', margin: [0, 0, 0, 20] },
        {
          columns: [
            { text: '' },
            {
              stack: [
                { text: 'GIÁO VIÊN CHỦ NHIỆM', bold: true, alignment: 'center' },
                { text: '\n\n\n' },
                { text: data.teacherName, bold: true, alignment: 'center' },
              ],
            },
          ],
        },
      ],
      styles: {
        header: { fontSize: 16, bold: true, color: '#0D9488', margin: [0, 0, 0, 5] },
        subHeader: { fontSize: 10, italics: true, color: '#475569' },
        sectionHeader: { fontSize: 11, bold: true, color: '#0F766E', margin: [0, 8, 0, 4] },
      },
      defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.3 },
    };

    const pdfDoc = pdfMake.createPdf(docDefinition);
    return await pdfDoc.getBuffer();
  }

  /**
   * Generate Word (.docx) for Monthly Summary
   */
  async generateMonthlySummaryDocx(data: MonthlySummaryExportData): Promise<Buffer> {
    const children: any[] = [];

    // Title
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: `BÁO CÁO CÔNG TÁC CHỦ NHIỆM THÁNG ${data.month}/${data.year}`,
            bold: true,
            size: 32,
            font: 'Times New Roman',
            color: '0D9488',
          }),
        ],
      }),
    );

    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: `Lớp: ${data.className}  |  Năm học: ${data.schoolYearName}  |  GVCN: ${data.teacherName}`,
            italics: true,
            size: 22,
            font: 'Times New Roman',
            color: '475569',
          }),
        ],
      }),
    );

    const addSectionHeader = (title: string) => {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 80 },
          children: [
            new TextRun({
              text: title,
              bold: true,
              size: 24,
              font: 'Times New Roman',
              color: '0F766E',
            }),
          ],
        }),
      );
    };

    const addParagraph = (text: string, isItalic = false) => {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({
              text,
              italics: isItalic,
              size: 22,
              font: 'Times New Roman',
            }),
          ],
        }),
      );
    };

    // I. Chuyên cần
    addSectionHeader('I. TÌNH HÌNH CHUYÊN CẦN');
    addParagraph(
      `• Tổng số ngày học trong tháng: ${data.attendance.totalSchoolDays} ngày  |  Sĩ số lớp: ${data.attendance.totalStudents} học sinh`,
    );
    addParagraph(
      `• Tỷ lệ chuyên cần toàn tháng: ${data.attendance.attendanceRate}%  |  Nghỉ có phép: ${data.attendance.excusedAbsence}  |  Nghỉ không phép: ${data.attendance.unexcusedAbsence}  |  Đi muộn: ${data.attendance.late}`,
    );

    // II. Học tập
    addSectionHeader('II. KẾT QUẢ HỌC TẬP & ĐÁNH GIÁ');
    addParagraph(
      `• Mức Hoàn thành tốt: ${data.learning.excellent} học sinh  |  Hoàn thành: ${data.learning.completed} học sinh  |  Cần hỗ trợ: ${data.learning.needsSupport} học sinh`,
    );

    // III. Nề nếp
    addSectionHeader('III. TỔNG HỢP NỀ NẾP & RÈN LUYỆN');
    addParagraph(
      `• Biểu dương tích cực: ${data.behavior.positive} lượt  |  Nhắc nhở nề nếp: ${data.behavior.reminder} lượt  |  Cần lưu ý: ${data.behavior.needsAttention} lượt`,
    );

    // IV. Thành tích & Điểm nổi bật
    addSectionHeader('IV. THÀNH TÍCH & ĐIỂM NỔI BẬT TRONG THÁNG');
    addParagraph(data.highlights?.trim() || 'Lớp đạt danh hiệu thi đua tốt trong tháng, các phong trào học tập diễn ra sôi nổi.');

    // V. Học sinh cần hỗ trợ & Học sinh có tiến bộ
    addSectionHeader('V. HỌC SINH CẦN HỖ TRỢ & HỌC SINH TIẾN BỘ');
    if (data.studentsNeedingSupport.length > 0) {
      addParagraph('• Học sinh cần tiếp tục kèm cặp, hỗ trợ:');
      data.studentsNeedingSupport.forEach((s, idx) => {
        addParagraph(`  ${idx + 1}. ${s.name}: ${s.reasons.join(', ')}`);
      });
    }
    if (data.studentsImproved.length > 0) {
      addParagraph('• Học sinh có tiến bộ vượt bậc:');
      data.studentsImproved.forEach((s, idx) => {
        addParagraph(`  ${idx + 1}. ${s.name}: ${s.note}`);
      });
    }
    if (data.studentsNeedingSupport.length === 0 && data.studentsImproved.length === 0) {
      addParagraph('Tất cả học sinh đều duy trì tiến độ học tập ổn định.', true);
    }

    // VI. Hạn chế
    addSectionHeader('VI. HẠN CHẾ CẦN KHẮC PHỤC');
    addParagraph(data.limitations?.trim() || 'Cần chú trọng giữ gìn vệ sinh chung và trật tự khi xếp hàng ra về.');

    // VII. Kế hoạch tháng tiếp theo
    addSectionHeader('VII. KẾ HOẠCH CÔNG TÁC THÁNG TIẾP THEO');
    addParagraph(data.nextMonthPlan?.trim() || 'Tập trung ôn tập các nội dung trọng tâm, tổ chức sinh hoạt chủ điểm theo kế hoạch.');

    // Signatures
    children.push(
      new Paragraph({
        spacing: { before: 300 },
        children: [
          new TextRun({
            text: '                                                                                  GIÁO VIÊN CHỦ NHIỆM',
            bold: true,
            size: 22,
            font: 'Times New Roman',
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { before: 500 },
        children: [
          new TextRun({
            text: `                                                                                  ${data.teacherName}`,
            bold: true,
            size: 22,
            font: 'Times New Roman',
          }),
        ],
      }),
    );

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
            },
          },
          children,
        },
      ],
    });

    return Packer.toBuffer(doc);
  }

  /**
   * Generate PDF for Monthly Summary
   */
  async generateMonthlySummaryPdf(data: MonthlySummaryExportData): Promise<Buffer> {
    const docDefinition: any = {
      content: [
        {
          text: `BÁO CÁO CÔNG TÁC CHỦ NHIỆM THÁNG ${data.month}/${data.year}`,
          style: 'header',
          alignment: 'center',
        },
        {
          text: `Lớp: ${data.className}  |  Năm học: ${data.schoolYearName}  |  GVCN: ${data.teacherName}`,
          style: 'subHeader',
          alignment: 'center',
          margin: [0, 0, 0, 15],
        },
        { text: 'I. TÌNH HÌNH CHUYÊN CẦN', style: 'sectionHeader' },
        {
          text: `• Ngày học: ${data.attendance.totalSchoolDays}  |  Sĩ số: ${data.attendance.totalStudents}  |  Tỷ lệ chuyên cần: ${data.attendance.attendanceRate}%\n• Nghỉ có phép: ${data.attendance.excusedAbsence}  |  Nghỉ không phép: ${data.attendance.unexcusedAbsence}  |  Đi muộn: ${data.attendance.late}`,
          margin: [0, 0, 0, 8],
        },
        { text: 'II. KẾT QUẢ HỌC TẬP & ĐÁNH GIÁ', style: 'sectionHeader' },
        {
          text: `• Hoàn thành tốt: ${data.learning.excellent}  |  Hoàn thành: ${data.learning.completed}  |  Cần hỗ trợ: ${data.learning.needsSupport}`,
          margin: [0, 0, 0, 8],
        },
        { text: 'III. TỔNG HỢP NỀ NẾP & RÈN LUYỆN', style: 'sectionHeader' },
        {
          text: `• Tích cực: ${data.behavior.positive}  |  Nhắc nhở: ${data.behavior.reminder}  |  Cần lưu ý: ${data.behavior.needsAttention}`,
          margin: [0, 0, 0, 8],
        },
        { text: 'IV. THÀNH TÍCH & ĐIỂM NỔI BẬT', style: 'sectionHeader' },
        { text: data.highlights?.trim() || 'Lớp đạt danh hiệu thi đua tốt trong tháng.', margin: [0, 0, 0, 8] },
        { text: 'V. HỌC SINH CẦN HỖ TRỢ', style: 'sectionHeader' },
        {
          ul:
            data.studentsNeedingSupport.length > 0
              ? data.studentsNeedingSupport.map((s) => `${s.name}: ${s.reasons.join(', ')}`)
              : ['Không có học sinh trong diện cần hỗ trợ đặc biệt.'],
          margin: [0, 0, 0, 8],
        },
        { text: 'VI. HẠN CHẾ CẦN KHẮC PHỤC', style: 'sectionHeader' },
        { text: data.limitations?.trim() || 'Cần chú trọng nề nếp xếp hàng ra về.', margin: [0, 0, 0, 8] },
        { text: 'VII. KẾ HOẠCH THÁNG TIẾP THEO', style: 'sectionHeader' },
        { text: data.nextMonthPlan?.trim() || 'Tập trung ôn tập kiến thức, nâng cao tính tự giác.', margin: [0, 0, 0, 20] },
        {
          columns: [
            { text: '' },
            {
              stack: [
                { text: 'GIÁO VIÊN CHỦ NHIỆM', bold: true, alignment: 'center' },
                { text: '\n\n\n' },
                { text: data.teacherName, bold: true, alignment: 'center' },
              ],
            },
          ],
        },
      ],
      styles: {
        header: { fontSize: 16, bold: true, color: '#0D9488', margin: [0, 0, 0, 5] },
        subHeader: { fontSize: 10, italics: true, color: '#475569' },
        sectionHeader: { fontSize: 11, bold: true, color: '#0F766E', margin: [0, 8, 0, 4] },
      },
      defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.3 },
    };

    const pdfDoc = pdfMake.createPdf(docDefinition);
    return await pdfDoc.getBuffer();
  }
}
