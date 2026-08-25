import { GenerateWorksheetDto } from '../dto/generate-worksheet.dto';

export function buildWorksheetPrompt(dto: GenerateWorksheetDto): string {
  const count = dto.numberOfQuestions || 5;
  const difficulty = dto.difficulty || 'Trung bình';
  const types = dto.questionTypes && dto.questionTypes.length > 0
    ? dto.questionTypes.join(', ')
    : 'MULTIPLE_CHOICE, TRUE_FALSE, FILL_BLANK';
  const includeAnswers = dto.includeAnswers !== false;

  return `Hãy biên soạn một Phiếu học tập tiểu học chất lượng cao dành cho học sinh:

Thông tin bài học:
- Khối lớp: Lớp ${dto.grade}
- Môn học: ${dto.subject}
- Bài học / Chủ đề: ${dto.lesson}
- Số lượng câu hỏi: ${count} câu
- Độ khó: ${difficulty}
- Các dạng câu hỏi mong muốn: ${types}
${dto.knowledgeContent ? `- Nội dung kiến thức trọng tâm: ${dto.knowledgeContent}` : ''}
${dto.additionalRequirements ? `- Yêu cầu bổ sung: ${dto.additionalRequirements}` : ''}
- Có đáp án cho giáo viên: ${includeAnswers ? 'Có' : 'Vẫn trả correctAnswer/explanation nhưng ngắn gọn'}
- Gợi ý hình minh họa: ${dto.includeIllustrations ? 'Có, mô tả ngắn trong explanation nếu câu hỏi cần hình' : 'Không bắt buộc'}

Yêu cầu biên soạn:
1. Câu hỏi phải rõ ràng, ngắn gọn, phù hợp với trình độ nhận thức của học sinh Lớp ${dto.grade}.
2. Nội dung các câu hỏi phân bố hợp lý từ cơ bản đến nâng cao.
3. Đối với dạng trắc nghiệm (MULTIPLE_CHOICE): cung cấp đúng 4 phương án (A, B, C, D) với 1 đáp án đúng duy nhất.
4. Đối với dạng Đúng/Sai (TRUE_FALSE): phát biểu chính xác, rõ nghĩa.
5. Đối với dạng Điền khuyết (FILL_BLANK): câu văn ngữ cảnh rõ ràng.
6. Mỗi câu hỏi phải có đáp án đúng (correctAnswer) và phần giải thích ngắn gọn, dễ hiểu (explanation).`;
}
