import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as JSZip from 'jszip';

export interface ParsedActivity {
  phase: string;
  title: string;
  durationMinutes: number;
  method?: string;
  technique?: string;
  competencies?: string;
  qualities?: string;
  equipment?: string;
  objective?: string;
  teacherActivity?: string;
  studentActivity?: string;
  sortOrder: number;
}

export interface ParsedLessonPlan {
  title: string;
  topic?: string | null;
  subjectName?: string | null;
  gradeName?: string | null;
  durationMinutes?: number;
  objectives?: string | null;
  specificCompetencies?: string | null;
  generalCompetencies?: string | null;
  qualities?: string | null;
  teachingEquipment?: string | null;
  postLessonAdjustment?: string | null;
  notes?: string | null;
  activities: ParsedActivity[];
  warning?: string | null;
}

const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB

@Injectable()
export class DocxParserService {
  private readonly logger = new Logger(DocxParserService.name);

  /**
   * Safely parses a DOCX buffer and extracts structured lesson plan data
   */
  async parse(buffer: Buffer): Promise<ParsedLessonPlan> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Tập tin DOCX rỗng hoặc không hợp lệ');
    }

    // Basic zip header check (PK\x03\x04)
    if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
      throw new BadRequestException('Tập tin không phải là định dạng Microsoft Word (.docx) hợp lệ');
    }

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch (err: any) {
      throw new BadRequestException('Không thể giải nén tập tin DOCX: ' + (err?.message || 'Lỗi định dạng ZIP'));
    }

    // Zip Slip and decompression bomb protection
    let totalUncompressedSize = 0;
    for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
      if (relativePath.includes('..') || relativePath.startsWith('/') || relativePath.startsWith('\\')) {
        throw new BadRequestException('Tập tin DOCX chứa đường dẫn không an toàn');
      }
      // Check for macros / dangerous files
      const lower = relativePath.toLowerCase();
      if (lower.endsWith('.vba') || lower.endsWith('.vbe') || lower.endsWith('.exe') || lower.endsWith('.bat')) {
        throw new BadRequestException('Tập tin DOCX chứa mã thực thi hoặc macro không được phép');
      }
      // Estimate size
      const entryAny = zipEntry as any;
      if (entryAny._data && entryAny._data.uncompressedSize) {
        totalUncompressedSize += entryAny._data.uncompressedSize;
        if (totalUncompressedSize > MAX_UNCOMPRESSED_BYTES) {
          throw new BadRequestException('Tập tin DOCX vượt quá kích thước giải nén cho phép (50MB)');
        }
      }
    }

    const docXmlEntry = zip.file('word/document.xml');
    if (!docXmlEntry) {
      throw new BadRequestException('Tập tin DOCX thiếu thành phần chính (word/document.xml)');
    }

    const xml = await docXmlEntry.async('string');
    return this.parseDocumentXml(xml);
  }

  /**
   * Parses word/document.xml content into structured lesson plan
   */
  parseDocumentXml(xml: string): ParsedLessonPlan {
    const rawElements = this.extractBlocks(xml);
    return this.structureLessonPlan(rawElements);
  }

  private extractBlocks(xml: string): Array<{ type: 'paragraph' | 'table'; text: string; rows?: string[][] }> {
    const blocks: Array<{ type: 'paragraph' | 'table'; text: string; rows?: string[][] }> = [];

    // Regex to match paragraphs and tables sequentially
    const blockRegex = /<w:(p|tbl)(?:[\s>][\s\S]*?<\/w:\1>)/g;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(xml)) !== null) {
      const blockTag = match[1];
      const blockContent = match[0];

      if (blockTag === 'p') {
        const text = this.extractParagraphText(blockContent);
        if (text.trim()) {
          blocks.push({ type: 'paragraph', text: text.trim() });
        }
      } else if (blockTag === 'tbl') {
        const rows = this.extractTableRows(blockContent);
        if (rows.length > 0) {
          const flatText = rows.map((r) => r.join(' | ')).join('\n');
          blocks.push({ type: 'table', text: flatText, rows });
        }
      }
    }

    return blocks;
  }

  private extractParagraphText(pXml: string): string {
    // Collect all <w:t>, <w:tab/>, <w:br/>
    let text = '';
    const elemRegex = /<w:(t|tab|br)(?:[\s>][\s\S]*?<\/w:\1>|\s*\/?>)/g;
    let elemMatch: RegExpExecArray | null;

    while ((elemMatch = elemRegex.exec(pXml)) !== null) {
      const tag = elemMatch[1];
      const full = elemMatch[0];
      if (tag === 't') {
        const innerMatch = />([\s\S]*?)<\/w:t>/.exec(full);
        if (innerMatch) {
          text += this.decodeXmlEntities(innerMatch[1]);
        }
      } else if (tag === 'tab') {
        text += '  ';
      } else if (tag === 'br') {
        text += '\n';
      }
    }

    return text;
  }

  private extractTableRows(tblXml: string): string[][] {
    const rows: string[][] = [];
    const trRegex = /<w:tr[\s\S]*?<\/w:tr>/g;
    let trMatch: RegExpExecArray | null;

    while ((trMatch = trRegex.exec(tblXml)) !== null) {
      const trXml = trMatch[0];
      const cells: string[] = [];
      const tcRegex = /<w:tc[\s\S]*?<\/w:tc>/g;
      let tcMatch: RegExpExecArray | null;

      while ((tcMatch = tcRegex.exec(trXml)) !== null) {
        const tcXml = tcMatch[0];
        // Extract all paragraphs in cell
        const pRegex = /<w:p[\s\S]*?<\/w:p>/g;
        let pMatch: RegExpExecArray | null;
        const pTexts: string[] = [];

        while ((pMatch = pRegex.exec(tcXml)) !== null) {
          const pt = this.extractParagraphText(pMatch[0]);
          if (pt.trim()) {
            pTexts.push(pt.trim());
          }
        }
        cells.push(pTexts.join('\n').trim());
      }

      if (cells.some((c) => c.length > 0)) {
        rows.push(cells);
      }
    }

    return rows;
  }

  private decodeXmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  private structureLessonPlan(
    blocks: Array<{ type: 'paragraph' | 'table'; text: string; rows?: string[][] }>,
  ): ParsedLessonPlan {
    let title = '';
    let topic = '';
    let subjectName = '';
    let gradeName = '';
    let durationMinutes = 40;
    let objectives = '';
    let specificCompetencies = '';
    let generalCompetencies = '';
    let qualities = '';
    let teachingEquipment = '';
    let postLessonAdjustment = '';
    let notes = '';

    const activities: ParsedActivity[] = [];

    // State machine for sections
    type SectionMode = 'NONE' | 'OBJECTIVES' | 'EQUIPMENT' | 'ACTIVITIES' | 'ADJUSTMENT' | 'NOTES';
    let currentMode: SectionMode = 'NONE';
    let currentObjectiveSub: 'GENERAL' | 'SPECIFIC_COMP' | 'GEN_COMP' | 'QUALITIES' = 'GENERAL';

    interface RawActivityAcc {
      phase: string;
      title: string;
      objective: string;
      method: string;
      technique: string;
      competencies: string;
      qualities: string;
      equipment: string;
      teacher: string[];
      students: string[];
    }

    let currentActivity: RawActivityAcc | null = null;

    const finalizeCurrentActivity = () => {
      if (currentActivity) {
        activities.push({
          phase: currentActivity.phase,
          title: currentActivity.title || `Hoạt động ${activities.length + 1}`,
          durationMinutes: Math.max(5, Math.round(35 / Math.max(1, activities.length + 1))),
          objective: currentActivity.objective || undefined,
          method: currentActivity.method || 'Thảo luận, trực quan',
          technique: currentActivity.technique || 'Động não, khăn trải bàn',
          competencies: currentActivity.competencies || 'Tự chủ và tự học, giao tiếp và hợp tác',
          qualities: currentActivity.qualities || 'Chăm chỉ, trách nhiệm',
          equipment: currentActivity.equipment || undefined,
          teacherActivity: currentActivity.teacher.join('\n\n').trim() || undefined,
          studentActivity: currentActivity.students.join('\n\n').trim() || undefined,
          sortOrder: activities.length,
        });
        currentActivity = null;
      }
    };

    for (const block of blocks) {
      const line = block.text.trim();
      const lower = line.toLowerCase();

      // Check for document-level metadata at the beginning
      if (!title && (lower.startsWith('kế hoạch bài dạy') || lower.startsWith('giáo án') || lower.startsWith('bài: ') || lower.startsWith('tên bài:'))) {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          title = line.slice(colonIdx + 1).trim();
        } else {
          title = line.replace(/kế hoạch bài dạy|giáo án/gi, '').trim();
        }
        continue;
      }

      if (!title && !title.length && block.type === 'paragraph' && line.length > 5 && line.length < 120 && !line.includes('Trường:') && !line.includes('Giáo viên:')) {
        title = line;
        continue;
      }

      // Check subject/grade hints
      if (lower.includes('môn:') || lower.includes('môn học:')) {
        const m = /môn(?:\s+học)?:\s*([^,\n;]+)/i.exec(line);
        if (m) subjectName = m[1].trim();
      }
      if (lower.includes('lớp:') || lower.includes('khối:')) {
        const m = /(?:lớp|khối):\s*([^,\n;]+)/i.exec(line);
        if (m) gradeName = m[1].trim();
      }
      if (lower.includes('thời lượng:') || lower.includes('tiết:')) {
        const m = /(?:thời lượng|số tiết|tiết):\s*(\d+)/i.exec(line);
        if (m) durationMinutes = parseInt(m[1], 10) * 35 || 40;
      }

      // Section headers detection
      if (/^(?:I|1)[\.\s-]+MỤC\s+TIÊU/i.test(line) || /^YÊU\s+CẦU\s+CẦN\s+ĐẠT/i.test(line)) {
        finalizeCurrentActivity();
        currentMode = 'OBJECTIVES';
        currentObjectiveSub = 'GENERAL';
        continue;
      }

      if (/^(?:II|2)[\.\s-]+(?:THIẾT\s+BỊ|ĐỒ\s+DÙNG)/i.test(line)) {
        finalizeCurrentActivity();
        currentMode = 'EQUIPMENT';
        continue;
      }

      if (/^(?:III|3)[\.\s-]+(?:TIẾN\s+TRÌNH|CÁC\s+HOẠT\s+ĐỘNG)/i.test(line)) {
        finalizeCurrentActivity();
        currentMode = 'ACTIVITIES';
        continue;
      }

      if (/^(?:IV|4)[\.\s-]+(?:ĐIỀU\s+CHỈNH|RÚT\s+KINH\s+NGHIỆM)/i.test(line)) {
        finalizeCurrentActivity();
        currentMode = 'ADJUSTMENT';
        continue;
      }

      // Inside OBJECTIVES
      if (currentMode === 'OBJECTIVES') {
        if (/^1[\.\s-]+(?:Về\s+)?kiến\s+thức/i.test(line)) {
          currentObjectiveSub = 'GENERAL';
          const content = line.replace(/^1[\.\s-]+(?:Về\s+)?kiến\s+thức[:\s]*/i, '').trim();
          if (content) objectives += (objectives ? '\n' : '') + content;
          continue;
        }
        if (/^2[\.\s-]+(?:Về\s+)?năng\s+lực/i.test(line) || /năng\s+lực\s+đặc\s+thù/i.test(line)) {
          currentObjectiveSub = 'SPECIFIC_COMP';
          const content = line.replace(/^(?:2[\.\s-]+)?(?:Về\s+)?năng\s+lực(?:\s+đặc\s+thù)?[:\s]*/i, '').trim();
          if (content) specificCompetencies += (specificCompetencies ? '\n' : '') + content;
          continue;
        }
        if (/năng\s+lực\s+chung/i.test(line)) {
          currentObjectiveSub = 'GEN_COMP';
          const content = line.replace(/năng\s+lực\s+chung[:\s]*/i, '').trim();
          if (content) generalCompetencies += (generalCompetencies ? '\n' : '') + content;
          continue;
        }
        if (/^3[\.\s-]+(?:Về\s+)?phẩm\s+chất/i.test(line)) {
          currentObjectiveSub = 'QUALITIES';
          const content = line.replace(/^3[\.\s-]+(?:Về\s+)?phẩm\s+chất[:\s]*/i, '').trim();
          if (content) qualities += (qualities ? '\n' : '') + content;
          continue;
        }

        if (currentObjectiveSub === 'GENERAL') {
          objectives += (objectives ? '\n' : '') + line;
        } else if (currentObjectiveSub === 'SPECIFIC_COMP') {
          specificCompetencies += (specificCompetencies ? '\n' : '') + line;
        } else if (currentObjectiveSub === 'GEN_COMP') {
          generalCompetencies += (generalCompetencies ? '\n' : '') + line;
        } else if (currentObjectiveSub === 'QUALITIES') {
          qualities += (qualities ? '\n' : '') + line;
        }
        continue;
      }

      // Inside EQUIPMENT
      if (currentMode === 'EQUIPMENT') {
        teachingEquipment += (teachingEquipment ? '\n' : '') + line;
        continue;
      }

      // Inside ADJUSTMENT
      if (currentMode === 'ADJUSTMENT') {
        postLessonAdjustment += (postLessonAdjustment ? '\n' : '') + line;
        continue;
      }

      // Inside ACTIVITIES
      if (currentMode === 'ACTIVITIES') {
        // Skip table headers / labels
        if (/^Hoạt\s+động\s+của\s+(?:giáo\s+viên|học\s+sinh|gv|hs)/i.test(line)) {
          // Handled below as table rows / content
        } else {
          const actMatch =
            /^(?:Hoạt\s+động\s+(\d+|[A-DIVX]+|Khởi\s+động|Khám\s+phá|Hình\s+thành|Luyện\s+tập|Thực\s+hành|Vận\s+dụng)|HĐ\s*(\d+|[A-DIVX]+)|\d+[\.\s-]+Hoạt\s+động)[:\.\s-]+([^\n]+)/i.exec(
              line,
            );
          if (actMatch) {
            finalizeCurrentActivity();
            const rawTitle = (actMatch[3] || line).trim();
            const phase = this.detectPhase(line);
            currentActivity = {
              phase,
              title: rawTitle,
              objective: '',
              method: 'Thảo luận nhóm, trực quan',
              technique: 'Động não, chia sẻ nhóm đôi',
              competencies: 'Giao tiếp và hợp tác, tự chủ tự học',
              qualities: 'Chăm chỉ, trách nhiệm',
              equipment: '',
              teacher: [],
              students: [],
            };
            continue;
          }
        }

        // Check for activity sub-elements
        if (currentActivity) {
          if (/^a[\)\.\s-]+Mục\s+tiêu/i.test(line)) {
            currentActivity.objective = line.replace(/^a[\)\.\s-]+Mục\s+tiêu[:\s]*/i, '').trim();
            continue;
          }
          if (/^b[\)\.\s-]+Nội\s+dung/i.test(line)) {
            const content = line.replace(/^b[\)\.\s-]+Nội\s+dung[:\s]*/i, '').trim();
            if (content) currentActivity.teacher.push(`Nội dung: ${content}`);
            continue;
          }
          if (/^c[\)\.\s-]+Sản\s+phẩm/i.test(line)) {
            const prod = line.replace(/^c[\)\.\s-]+Sản\s+phẩm[:\s]*/i, '').trim();
            if (prod) currentActivity.students.push(`Sản phẩm: ${prod}`);
            continue;
          }

          // If block is a table, check for 2-column or 3-column teacher/student activities
          if (block.type === 'table' && block.rows && block.rows.length > 0) {
            for (const row of block.rows) {
              if (row.length >= 2) {
                // Check header
                const col0 = row[0].toLowerCase();
                const col1 = row[1].toLowerCase();
                if (col0.includes('hoạt động của gv') || col0.includes('giáo viên') || col1.includes('học sinh')) {
                  continue; // skip table header row
                }
                if (row[0].trim()) currentActivity.teacher.push(row[0].trim());
                if (row[1].trim()) currentActivity.students.push(row[1].trim());
              } else if (row.length === 1 && row[0].trim()) {
                currentActivity.teacher.push(row[0].trim());
              }
            }
            continue;
          }

          // Check teacher/student labels in paragraph
          if (/^(?:GV|Giáo\s+viên)[:\s-]+/i.test(line)) {
            currentActivity.teacher.push(line);
            continue;
          }
          if (/^(?:HS|Học\s+sinh)[:\s-]+/i.test(line)) {
            currentActivity.students.push(line);
            continue;
          }

          currentActivity.teacher.push(line);
          continue;
        }
      }

      // General fallback lines
      notes += (notes ? '\n' : '') + line;
    }

    finalizeCurrentActivity();

    // Fallback: If no structured activities were found, generate standard phases with document content
    if (activities.length === 0) {
      activities.push(
        {
          phase: 'Khởi động',
          title: 'Khởi động và kết nối',
          durationMinutes: 5,
          method: 'Trò chơi, thảo luận',
          technique: 'Động não',
          competencies: 'Giao tiếp và hợp tác',
          qualities: 'Hào hứng, tự tin',
          objective: 'Tạo tâm thế hứng thú, kết nối kiến thức bài học.',
          teacherActivity: 'Giáo viên tổ chức hoạt động mở đầu theo tài liệu đính kèm.',
          studentActivity: 'Học sinh tham gia và phản hồi.',
          sortOrder: 0,
        },
        {
          phase: 'Khám phá',
          title: 'Khám phá và hình thành kiến thức',
          durationMinutes: 15,
          method: 'Trực quan, đàm thoại gợi mở',
          technique: 'Khăn trải bàn, thảo luận nhóm',
          competencies: 'Tự chủ và tự học, giải quyết vấn đề',
          qualities: 'Chăm chỉ, trung thực',
          objective: objectives || 'Hình thành kiến thức trọng tâm của bài học.',
          teacherActivity: notes || 'Giáo viên hướng dẫn học sinh tìm hiểu nội dung bài học.',
          studentActivity: 'Học sinh quan sát, trao đổi và rút ra kết luận.',
          sortOrder: 1,
        },
        {
          phase: 'Luyện tập',
          title: 'Thực hành và luyện tập',
          durationMinutes: 15,
          method: 'Luyện tập cá nhân và nhóm',
          technique: 'Chia sẻ nhóm đôi',
          competencies: 'Vận dụng kiến thức',
          qualities: 'Cẩn thận, chính xác',
          objective: 'Củng cố và rèn luyện kỹ năng thực hành.',
          teacherActivity: 'Giáo viên giao bài tập và quan sát, hỗ trợ học sinh.',
          studentActivity: 'Học sinh hoàn thành bài tập vào vở hoặc phiếu học tập.',
          sortOrder: 2,
        },
        {
          phase: 'Vận dụng',
          title: 'Vận dụng và trải nghiệm',
          durationMinutes: 5,
          method: 'Giao nhiệm vụ thực tế',
          technique: 'Tự đánh giá',
          competencies: 'Sáng tạo và giải quyết vấn đề',
          qualities: 'Trách nhiệm',
          objective: 'Vận dụng kiến thức vào thực tế cuộc sống.',
          teacherActivity: 'Giáo viên hướng dẫn nhiệm vụ về nhà hoặc mở rộng.',
          studentActivity: 'Học sinh ghi nhận và liên hệ thực tế.',
          sortOrder: 3,
        },
      );
    }

    return {
      title: title || 'Kế hoạch bài dạy',
      topic: topic || undefined,
      subjectName: subjectName || 'Toán',
      gradeName: gradeName || 'Lớp 4A',
      durationMinutes: durationMinutes || 40,
      objectives: objectives || 'Nắm vững kiến thức trọng tâm và yêu cầu cần đạt của bài học.',
      specificCompetencies: specificCompetencies || undefined,
      generalCompetencies: generalCompetencies || undefined,
      qualities: qualities || undefined,
      teachingEquipment: teachingEquipment || undefined,
      postLessonAdjustment: postLessonAdjustment || undefined,
      notes: notes || undefined,
      activities,
      warning: 'Một số định dạng nâng cao có thể không chỉnh sửa được hoàn toàn trong TeachFlow.',
    };
  }

  private detectPhase(rawTitle: string): string {
    const lower = rawTitle.toLowerCase();
    if (lower.includes('khởi động') || lower.includes('mở đầu') || lower.includes('trò chơi')) return 'Khởi động';
    if (lower.includes('khám phá') || lower.includes('hình thành') || lower.includes('kiến thức')) return 'Khám phá';
    if (lower.includes('luyện tập') || lower.includes('thực hành')) return 'Luyện tập';
    if (lower.includes('vận dụng') || lower.includes('mở rộng') || lower.includes('trải nghiệm')) return 'Vận dụng';
    return 'Hoạt động';
  }
}
