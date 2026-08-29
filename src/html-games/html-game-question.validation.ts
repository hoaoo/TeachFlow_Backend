import { BadRequestException } from '@nestjs/common';
import { HtmlGameQuestionType, Prisma } from '@prisma/client';
import { CreateHtmlGameQuestionDto, UpdateHtmlGameQuestionDto } from './dto/html-game-question.dto';

const jsonValue = (value: unknown, field: string): Prisma.InputJsonValue => {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > 64 * 1024) {
      throw new Error();
    }
    return value as Prisma.InputJsonValue;
  } catch {
    throw new BadRequestException(`${field} không phải dữ liệu JSON hợp lệ hoặc quá lớn`);
  }
};

export function validateQuestionPayload(
  dto: CreateHtmlGameQuestionDto | UpdateHtmlGameQuestionDto,
): Record<string, any> {
  const data: Record<string, any> = {};
  if (dto.order !== undefined) data.order = dto.order;
  if (dto.question !== undefined) {
    const question = dto.question.trim();
    if (!question) throw new BadRequestException('Nội dung câu hỏi không được để trống');
    data.question = question;
  }
  if (dto.type !== undefined) data.type = dto.type;
  if (dto.explanation !== undefined) data.explanation = dto.explanation?.trim() || null;
  if (dto.metadata !== undefined) {
    data.metadata = dto.metadata === null ? Prisma.DbNull : jsonValue(dto.metadata, 'metadata');
  }

  const type = dto.type;
  if (type !== undefined || dto.options !== undefined || dto.correctAnswer !== undefined) {
    if (!type) throw new BadRequestException('Cần gửi type khi cập nhật đáp án hoặc lựa chọn');
    if (
      type === HtmlGameQuestionType.SINGLE_CHOICE ||
      type === HtmlGameQuestionType.MULTIPLE_CHOICE
    ) {
      if (!Array.isArray(dto.options) || dto.options.length < 2 || dto.options.length > 12) {
        throw new BadRequestException('Câu hỏi lựa chọn cần từ 2 đến 12 đáp án');
      }
      const options = dto.options.map((item) => String(item).trim());
      if (options.some((item) => !item || item.length > 500) || new Set(options).size !== options.length) {
        throw new BadRequestException('Các lựa chọn phải khác nhau, không trống và tối đa 500 ký tự');
      }
      if (type === HtmlGameQuestionType.SINGLE_CHOICE) {
        if (typeof dto.correctAnswer !== 'string' || !options.includes(dto.correctAnswer)) {
          throw new BadRequestException('Đáp án đúng phải là một lựa chọn hợp lệ');
        }
      } else {
        if (
          !Array.isArray(dto.correctAnswer) ||
          dto.correctAnswer.length < 1 ||
          dto.correctAnswer.some((answer) => typeof answer !== 'string' || !options.includes(answer))
        ) {
          throw new BadRequestException('Các đáp án đúng phải thuộc danh sách lựa chọn');
        }
      }
      data.options = jsonValue(options, 'options');
    } else {
      data.options = Prisma.DbNull;
      if (type === HtmlGameQuestionType.TRUE_FALSE && typeof dto.correctAnswer !== 'boolean') {
        throw new BadRequestException('Đáp án TRUE_FALSE phải là true hoặc false');
      }
      if (
        type === HtmlGameQuestionType.SHORT_ANSWER &&
        (typeof dto.correctAnswer !== 'string' || !dto.correctAnswer.trim())
      ) {
        throw new BadRequestException('Đáp án SHORT_ANSWER phải là chuỗi không trống');
      }
    }
    if (dto.correctAnswer === null || dto.correctAnswer === undefined) {
      throw new BadRequestException('correctAnswer không được để trống');
    }
    data.correctAnswer = jsonValue(dto.correctAnswer, 'correctAnswer');
  }
  return data;
}
