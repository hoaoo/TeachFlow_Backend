import { GenerateQuestionsDto } from '../dto/generate-questions.dto';

export function buildQuestionsPrompt(dto: GenerateQuestionsDto): string {
  const count = dto.numberOfQuestions || 5;
  const levels = dto.levels && dto.levels.length > 0
    ? dto.levels.join(', ')
    : 'Nhận biết, Thông hiểu, Vận dụng';

  return `Hãy tạo bộ câu hỏi kiểm tra đánh giá tiểu học theo các cấp độ nhận thức (thang Bloom):

Thông tin:
- Khối lớp: Lớp ${dto.grade}
- Môn học: ${dto.subject}
- Chủ đề: ${dto.topic}
- Số lượng câu hỏi: ${count} câu
- Các mức độ nhận thức: ${levels}

Yêu cầu:
1. Phân bổ câu hỏi theo đúng các mức độ:
   - Nhận biết: Tái hiện, nhắc lại định nghĩa, công thức, quy tắc cơ bản.
   - Thông hiểu: Giải thích, so sánh, phân biệt, chuyển đổi cách biểu đạt.
   - Vận dụng: Giải quyết tình huống thực tế, bài toán ghép bước.
2. Câu hỏi đa dạng hình thức (Trắc nghiệm, Điền khuyết, Đúng/Sai, Tự luận ngắn).
3. Đầy đủ đáp án và lời giải chi tiết cho từng câu.`;
}
