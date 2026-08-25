import { Type, Schema } from '@google/genai';

export const worksheetSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Tiêu đề phiếu học tập',
    },
    questions: {
      type: Type.ARRAY,
      description: 'Danh sách các câu hỏi trong phiếu',
      items: {
        type: Type.OBJECT,
        properties: {
          questionType: {
            type: Type.STRING,
            description: 'Dạng câu hỏi: MULTIPLE_CHOICE | TRUE_FALSE | FILL_BLANK | MATCHING | ESSAY',
          },
          content: {
            type: Type.STRING,
            description: 'Nội dung câu hỏi rõ ràng, phù hợp học sinh tiểu học',
          },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Các lựa chọn đáp án (đối với trắc nghiệm)',
          },
          correctAnswer: {
            type: Type.STRING,
            description: 'Đáp án chính xác',
          },
          explanation: {
            type: Type.STRING,
            description: 'Giải thích chi tiết hoặc gợi ý chấm',
          },
        },
        required: ['questionType', 'content'],
      },
    },
  },
  required: ['title', 'questions'],
};
