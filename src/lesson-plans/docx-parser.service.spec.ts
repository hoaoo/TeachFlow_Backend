import { BadRequestException } from '@nestjs/common';
import { DocxParserService } from './docx-parser.service';
import * as JSZip from 'jszip';

describe('DocxParserService', () => {
  let service: DocxParserService;

  beforeEach(() => {
    service = new DocxParserService();
  });

  it('rejects empty or corrupt buffer', async () => {
    await expect(service.parse(Buffer.from(''))).rejects.toThrow(BadRequestException);
    await expect(service.parse(Buffer.from('not a zip file'))).rejects.toThrow(BadRequestException);
  });

  it('rejects zip missing word/document.xml', async () => {
    const zip = new JSZip();
    zip.file('something_else.txt', 'hello');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(service.parse(buffer)).rejects.toThrow(BadRequestException);
  });

  it('rejects zip slip attempts', async () => {
    const zip = new JSZip();
    zip.file('../evil.txt', 'evil content');
    zip.file('word/document.xml', '<w:document></w:document>');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(service.parse(buffer)).rejects.toThrow('đường dẫn không an toàn');
  });

  it('rejects dangerous macros or executables in docx', async () => {
    const zip = new JSZip();
    zip.file('word/vbaProject.bin.vba', 'malicious code');
    zip.file('word/document.xml', '<w:document></w:document>');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(service.parse(buffer)).rejects.toThrow('macro không được phép');
  });

  it('parses valid document XML into structured lesson plan', async () => {
    const xml = `
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>KẾ HOẠCH BÀI DẠY: HÌNH TRÒN - TÂM, ĐƯỜNG KÍNH, BÁN KÍNH</w:t></w:r></w:p>
          <w:p><w:r><w:t>Môn: Toán, Lớp: Lớp 4B, Thời lượng: 1 tiết</w:t></w:r></w:p>
          
          <w:p><w:r><w:t>I. MỤC TIÊU</w:t></w:r></w:p>
          <w:p><w:r><w:t>1. Về kiến thức: Nhận biết hình tròn, tâm, đường kính, bán kính.</w:t></w:r></w:p>
          <w:p><w:r><w:t>2. Về năng lực đặc thù: Vẽ hình tròn bằng com-pa.</w:t></w:r></w:p>
          <w:p><w:r><w:t>Năng lực chung: Tự chủ và tự học, giao tiếp hợp tác.</w:t></w:r></w:p>
          <w:p><w:r><w:t>3. Về phẩm chất: Cẩn thận, yêu thích môn học.</w:t></w:r></w:p>

          <w:p><w:r><w:t>II. THIẾT BỊ DẠY HỌC</w:t></w:r></w:p>
          <w:p><w:r><w:t>Com-pa, thước kẻ, bảng phụ, mô hình hình tròn.</w:t></w:r></w:p>

          <w:p><w:r><w:t>III. TIẾN TRÌNH DẠY HỌC</w:t></w:r></w:p>
          
          <w:p><w:r><w:t>Hoạt động 1: Khởi động - Trò chơi Chiếc nón kỳ diệu</w:t></w:r></w:p>
          <w:p><w:r><w:t>a) Mục tiêu: Tạo hứng thú và kết nối bài học.</w:t></w:r></w:p>
          <w:p><w:r><w:t>GV: Chiếu vòng quay và câu hỏi khởi động.</w:t></w:r></w:p>
          <w:p><w:r><w:t>HS: Quan sát và trả lời câu hỏi.</w:t></w:r></w:p>

          <w:p><w:r><w:t>Hoạt động 2: Khám phá kiến thức mới</w:t></w:r></w:p>
          <w:p><w:r><w:t>a) Mục tiêu: Nhận biết tâm O, bán kính OM, đường kính AB.</w:t></w:r></w:p>
          <w:tbl>
            <w:tr>
              <w:tc><w:p><w:r><w:t>Hoạt động của GV</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>Hoạt động của HS</w:t></w:r></w:p></w:tc>
            </w:tr>
            <w:tr>
              <w:tc><w:p><w:r><w:t>Hướng dẫn HS quan sát mô hình và xác định tâm O.</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>HS thảo luận nhóm đôi và chỉ ra điểm tâm O.</w:t></w:r></w:p></w:tc>
            </w:tr>
          </w:tbl>

          <w:p><w:r><w:t>IV. ĐIỀU CHỈNH SAU BÀI DẠY</w:t></w:r></w:p>
          <w:p><w:r><w:t>Học sinh thực hành tốt, cần lưu ý hướng dẫn cách cầm com-pa an toàn.</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `;

    const zip = new JSZip();
    zip.file('word/document.xml', xml);
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await service.parse(buffer);

    expect(result.title).toContain('HÌNH TRÒN');
    expect(result.subjectName).toBe('Toán');
    expect(result.gradeName).toBe('Lớp 4B');
    expect(result.objectives).toContain('Nhận biết hình tròn');
    expect(result.specificCompetencies).toContain('Vẽ hình tròn');
    expect(result.teachingEquipment).toContain('Com-pa');
    expect(result.activities.length).toBe(2);
    expect(result.activities[0].phase).toBe('Khởi động');
    expect(result.activities[0].objective).toContain('Tạo hứng thú');
    expect(result.activities[1].phase).toBe('Khám phá');
    expect(result.activities[1].teacherActivity).toContain('Hướng dẫn HS quan sát');
    expect(result.activities[1].studentActivity).toContain('HS thảo luận nhóm');
    expect(result.postLessonAdjustment).toContain('cách cầm com-pa');
  });
});
