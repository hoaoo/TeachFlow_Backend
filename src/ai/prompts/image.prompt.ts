import { GenerateImageDto } from '../dto/generate-image.dto';

const PURPOSE_LABEL: Record<string, string> = {
  'lesson-plan': 'minh họa giáo án tiểu học',
  worksheet: 'minh họa phiếu học tập cho học sinh tiểu học',
  resource: 'học liệu giảng dạy tiểu học',
};

export function buildImagePrompt(dto: GenerateImageDto): string {
  const purpose = PURPOSE_LABEL[dto.purpose || 'resource'] || PURPOSE_LABEL.resource;
  const style = dto.style?.trim() || 'minh họa sách giáo khoa Việt Nam, trong sáng, màu nước nhẹ';

  return [
    `Tạo một hình minh họa sư phạm dành cho ${purpose}.`,
    `Mô tả: ${dto.prompt.trim()}`,
    `Phong cách: ${style}.`,
    'Yêu cầu: phù hợp học sinh tiểu học Việt Nam, không bạo lực, không văn bản dài, không logo thương mại, không khuôn mặt người thật có thể nhận diện, bố cục rõ ràng dễ in ấn.',
  ].join('\n');
}
