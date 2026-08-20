import { Type, Schema } from '@google/genai';

export const lessonPlanSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Tên kế hoạch bài dạy',
    },
    objectives: {
      type: Type.STRING,
      description: 'Mục tiêu bài dạy (Yêu cầu cần đạt về năng lực đặc thù, năng lực chung và phẩm chất)',
    },
    teachingEquipment: {
      type: Type.STRING,
      description: 'Đồ dùng và thiết bị dạy học của giáo viên và học sinh',
    },
    activities: {
      type: Type.ARRAY,
      description: 'Các hoạt động dạy học theo tiến trình sư phạm',
      items: {
        type: Type.OBJECT,
        properties: {
          activityType: {
            type: Type.STRING,
            description: 'Loại hoạt động: WARM_UP | EXPLORE | PRACTICE | APPLICATION | OTHER',
          },
          title: {
            type: Type.STRING,
            description: 'Tên hoạt động ngắn gọn, hấp dẫn',
          },
          objective: {
            type: Type.STRING,
            description: 'Mục tiêu cụ thể của hoạt động',
          },
          durationMinutes: {
            type: Type.INTEGER,
            description: 'Thời lượng thực hiện tính theo phút',
          },
          methods: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Các phương pháp dạy học được áp dụng',
          },
          techniques: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Các kỹ thuật dạy học tích cực',
          },
          competencies: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Các năng lực được rèn luyện',
          },
          qualities: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Các phẩm chất được bồi dưỡng',
          },
          teacherActivity: {
            type: Type.STRING,
            description: 'Các bước triển khai cụ thể của giáo viên (giao việc, hướng dẫn, nhận xét)',
          },
          studentActivity: {
            type: Type.STRING,
            description: 'Hoạt động cụ thể của học sinh (thảo luận, thực hành, báo cáo, đánh giá)',
          },
        },
        required: [
          'activityType',
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
      },
    },
  },
  required: ['title', 'objectives', 'teachingEquipment', 'activities'],
};
