import { Type, Schema } from '@google/genai';

export const activitySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Tên hoạt động dạy học',
    },
    objective: {
      type: Type.STRING,
      description: 'Mục tiêu hoạt động học tập',
    },
    durationMinutes: {
      type: Type.INTEGER,
      description: 'Thời lượng thực hiện tính theo phút',
    },
    methods: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Phương pháp dạy học áp dụng',
    },
    techniques: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Kỹ thuật dạy học tích cực',
    },
    competencies: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Năng lực hình thành cho học sinh',
    },
    qualities: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Phẩm chất bồi dưỡng cho học sinh',
    },
    teacherActivity: {
      type: Type.STRING,
      description: 'Hoạt động cụ thể của giáo viên',
    },
    studentActivity: {
      type: Type.STRING,
      description: 'Hoạt động cụ thể của học sinh',
    },
  },
  required: [
    'title',
    'objective',
    'durationMinutes',
    'methods',
    'techniques',
    'competencies',
    'qualities',
    'teacherActivity',
    'studentActivity',
  ],
};
