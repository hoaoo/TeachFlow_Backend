import { Type, Schema } from '@google/genai';

export const importStudentsSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    students: {
      type: Type.ARRAY,
      description: 'Danh sách học sinh trích xuất được từ tệp',
      items: {
        type: Type.OBJECT,
        properties: {
          fullName: { type: Type.STRING, description: 'Họ và tên học sinh' },
          studentCode: { type: Type.STRING, description: 'Mã học sinh nếu có' },
          gender: { type: Type.STRING, description: 'Nam hoặc Nữ' },
          dob: { type: Type.STRING, description: 'Ngày sinh dạng dd/mm/yyyy nếu có' },
          parentName: { type: Type.STRING, description: 'Tên phụ huynh nếu có' },
          parentPhone: { type: Type.STRING, description: 'Số điện thoại phụ huynh nếu có' },
          note: { type: Type.STRING, description: 'Ghi chú nếu có' },
        },
        required: ['fullName'],
      },
    },
  },
  required: ['students'],
};
