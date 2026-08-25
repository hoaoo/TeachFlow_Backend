import { AnalyzeImportDto } from '../dto/analyze-import.dto';

export function buildImportStudentsPrompt(extractedText: string, dto: AnalyzeImportDto): string {
  return `Hãy trích xuất danh sách học sinh từ nội dung tài liệu dưới đây.

Chỉ trả về JSON theo schema. Không bịa mã học sinh nếu tài liệu không có.
Giới tính chuẩn hóa thành "Nam" hoặc "Nữ". Ngày sinh giữ dạng dd/mm/yyyy nếu nhận ra được.
Bỏ qua dòng tiêu đề, dòng trống và dữ liệu không phải học sinh.
${dto.notes ? `Ghi chú của giáo viên: ${dto.notes}` : ''}

Nội dung tài liệu:
${extractedText}`;
}

export function buildImportLessonPlanPrompt(extractedText: string, dto: AnalyzeImportDto): string {
  return `Hãy chuyển nội dung giáo án dưới đây thành JSON có cấu trúc (title, objectives, teachingEquipment, activities).
Không bịa hoạt động nếu tài liệu không có. Giữ tiếng Việt sư phạm.
${dto.notes ? `Ghi chú của giáo viên: ${dto.notes}` : ''}

Nội dung tài liệu:
${extractedText}`;
}

export function buildImportWorksheetPrompt(extractedText: string, dto: AnalyzeImportDto): string {
  return `Hãy chuyển nội dung phiếu học tập dưới đây thành JSON (title, questions).
questionType chỉ dùng: MULTIPLE_CHOICE, TRUE_FALSE, FILL_BLANK, MATCHING, ESSAY.
${dto.notes ? `Ghi chú của giáo viên: ${dto.notes}` : ''}

Nội dung tài liệu:
${extractedText}`;
}
