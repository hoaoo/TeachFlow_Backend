import { Type, Schema } from '@google/genai';

export const studentCommentSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    comments: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Danh sách 3 - 5 gợi ý nhận xét sư phạm ngắn gọn, tích cực, mang tính khích lệ và định hướng hành động',
    },
    overallAssessment: {
      type: Type.STRING,
      description: 'Tổng kết đánh giá mức độ tiến bộ của học sinh',
    },
    recommendations: {
      type: Type.STRING,
      description: 'Đề xuất biện pháp hỗ trợ hoặc phát triển cho học sinh trong thời gian tới',
    },
  },
  required: ['comments', 'overallAssessment', 'recommendations'],
};
