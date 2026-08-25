import { BadRequestException } from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

function flattenErrors(errors: ValidationError[], prefix = ''): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    if (error.constraints) {
      messages.push(`${path}: ${Object.values(error.constraints).join(', ')}`);
    }
    if (error.children && error.children.length > 0) {
      messages.push(...flattenErrors(error.children, path));
    }
  }
  return messages;
}

/**
 * Treat AI JSON as untrusted input: transform + class-validator.
 * Throws on invalid shape so the provider can retry with a limited budget.
 */
export function validateAiOutput<T extends object>(cls: ClassConstructor<T>, raw: unknown): T {
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    throw new Error('Malformed JSON received from model');
  }

  const instance = plainToInstance(cls, raw, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(instance, {
    whitelist: true,
    forbidNonWhitelisted: false,
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Malformed JSON received from model: ${flattenErrors(errors).slice(0, 8).join('; ')}`);
  }

  return instance;
}

export function rejectInvalidAiOutput(message = 'Dữ liệu AI trả về không đúng định dạng. Vui lòng thử lại.'): never {
  throw new BadRequestException(message);
}
