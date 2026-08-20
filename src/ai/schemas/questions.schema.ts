import { Type, Schema } from '@google/genai';

export const questionsSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    topic: {
      type: Type.STRING,
      description: 'Chủ đề các câu hỏi',
    },
    questions: {
      type: Type.ARRAY,
      description: 'Danh sách các câu hỏi được phân loại theo mức độ',
      items: {
        type: Type.OBJECT,
        properties: {
          level: {
            type: Type.STRING,
            description: 'Mức độ nhận thức: Nhận biết | Thông hiểu | Vận dụng',
          },
          questionType: {
            type: Type.STRING,
            description: 'Dạng câu hỏi: Trắc nghiệm | Đúng/Sai | Điền khuyết | Tự luận',
          },
          content: {
            type: Type.STRING,
            description: 'Nội dung câu hỏi',
          },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Các phương án chọn (nếu có)',
          },
          answer: {
            type: Type.STRING,
            description: 'Đáp án chính xác',
          },
          explanation: {
            type: Type.STRING,
            description: 'Hướng dẫn giải hoặc giải thích ngắn gọn',
          },
        },
        required: ['level', 'questionType', 'content', 'options', 'answer', 'explanation'],
      },
    },
  },
  required: ['topic', 'questions'],
};
