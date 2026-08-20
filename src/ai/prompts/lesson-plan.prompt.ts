import { GenerateLessonPlanDto } from '../dto/generate-lesson-plan.dto';

export function buildLessonPlanPrompt(dto: GenerateLessonPlanDto): string {
  const duration = dto.durationMinutes || 35;
  return `Hãy thiết kế một Kế hoạch bài dạy (Giáo án) tiểu học hoàn chỉnh theo định hướng phát triển phẩm chất, năng lực:

Thông tin bài học:
- Khối lớp: Lớp ${dto.grade}
- Môn học: ${dto.subject}
- Tên bài học: ${dto.lessonTitle}
- Tổng thời lượng: ${duration} phút
${dto.requirements ? `- Yêu cầu đặc biệt của giáo viên: ${dto.requirements}` : ''}

Yêu cầu cấu trúc bài dạy:
1. Xác định rõ mục tiêu cần đạt: Năng lực đặc thù của môn học, năng lực chung (tự chủ, giao tiếp hợp tác, giải quyết vấn đề) và phẩm chất (chăm chỉ, trung thực, trách nhiệm, nhân ái).
2. Liệt kê thiết bị, đồ dùng dạy học thực tế cho giáo viên và học sinh.
3. Thiết kế tiến trình gồm đầy đủ các hoạt động học tập:
   - WARM_UP (Khởi động / Kết nối): 3 - 5 phút (Tạo tâm thế hứng thú, kết nối kiến thức cũ)
   - EXPLORE (Khám phá / Hình thành kiến thức): 10 - 15 phút (Trực quan, hoạt động tìm tòi, thảo luận nhóm)
   - PRACTICE (Luyện tập / Thực hành): 10 - 15 phút (Làm bài tập, phiếu bài, củng cố quy tắc)
   - APPLICATION (Vận dụng / Mở rộng): 3 - 5 phút (Liên hệ thực tế, trò chơi nhanh)
   Tổng thời gian của các hoạt động phải đúng bằng ${duration} phút.
4. Ở mỗi hoạt động: Ghi rõ phương pháp, kỹ thuật dạy học tích cực, năng lực/phẩm chất rèn luyện, và chi tiết 2 cột Hoạt động của giáo viên & Hoạt động của học sinh.`;
}
