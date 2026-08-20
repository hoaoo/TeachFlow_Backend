import { GenerateActivityDto } from '../dto/generate-activity.dto';

const activityTypeNames: Record<string, string> = {
  WARM_UP: 'Khởi động / Kết nối',
  EXPLORE: 'Khám phá / Hình thành kiến thức mới',
  PRACTICE: 'Luyện tập / Thực hành',
  APPLICATION: 'Vận dụng / Mở rộng',
  OTHER: 'Hoạt động bổ trợ',
};

export function buildActivityPrompt(dto: GenerateActivityDto): string {
  const typeName = activityTypeNames[dto.activityType.toUpperCase()] || dto.activityType;
  const duration = dto.durationMinutes || 5;

  return `Hãy thiết kế một Hoạt động dạy học tiểu học chi tiết, sinh động và hiệu quả:

Thông tin hoạt động:
- Khối lớp: Lớp ${dto.grade}
- Môn học: ${dto.subject}
- Thuộc bài dạy: ${dto.lessonTitle}
- Loại hoạt động: ${typeName} (${dto.activityType})
- Thời lượng: ${duration} phút
${dto.requirement ? `- Yêu cầu cụ thể: ${dto.requirement}` : ''}

Yêu cầu chi tiết:
1. Đặt tên hoạt động hấp dẫn, khơi gợi trí tò mò của học sinh tiểu học.
2. Nêu rõ mục tiêu cần đạt của riêng hoạt động này.
3. Chỉ định phương pháp và kỹ thuật dạy học tích cực (ví dụ: Trò chơi học tập, Khăn trải bàn, Mảnh ghép, Sơ đồ tư duy, Đóng vai...).
4. Nêu các năng lực và phẩm chất được rèn luyện.
5. Mô tả chi tiết, sinh động:
   - Hoạt động của giáo viên (cách phổ biến luật, đặt câu hỏi gợi mở, quan sát giúp đỡ, tổ chức đánh giá).
   - Hoạt động của học sinh (thao tác, trao đổi nhóm, báo cáo, nhận xét).`;
}
