export interface AnonymizedStudentProfile {
  subject?: string;
  criteria?: Record<string, string>;
  assessmentLevel?: string;
  notes?: string;
}

export function buildStudentCommentPrompt(profile: AnonymizedStudentProfile): string {
  const criteriaText = profile.criteria
    ? Object.entries(profile.criteria)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')
    : '';

  return `Hãy đề xuất các lời nhận xét học tập và rèn luyện dành cho một học sinh tiểu học (dựa trên dữ liệu đánh giá ẩn danh):

Thông tin đánh giá năng lực của học sinh:
- Đối tượng: Học sinh tiểu học
${profile.subject ? `- Môn học: ${profile.subject}` : ''}
${profile.assessmentLevel ? `- Mức độ hoàn thành chung: ${profile.assessmentLevel}` : ''}
${criteriaText ? `- Kết quả theo các tiêu chí:\n${criteriaText}` : ''}
${profile.notes ? `- Ghi chú của giáo viên: ${profile.notes}` : ''}

Yêu cầu nhận xét:
1. Đưa ra 3 đến 5 câu nhận xét mẫu đa dạng, súc tích (1 - 2 câu mỗi nhận xét), dùng để ghi học bạ, sổ theo dõi hoặc gửi phụ huynh.
2. Lời văn mang tính khích lệ, công nhận nỗ lực, chỉ rõ điểm mạnh và hướng dẫn biện pháp khắc phục điểm cần cố gắng một cách tích cực, thân thiện.
3. Không sử dụng tên riêng hay từ ngữ gây áp lực tâm lý cho học sinh.
4. Đưa ra nhận định tổng quan (overallAssessment) và đề xuất sư phạm (recommendations) giúp giáo viên hỗ trợ học sinh hiệu quả hơn.`;
}
