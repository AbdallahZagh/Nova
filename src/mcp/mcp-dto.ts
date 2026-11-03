import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

export async function parseDto<T extends object>(
  cls: new () => T,
  payload: object,
): Promise<T> {
  const dto = plainToInstance(cls, payload);
  const errors = await validate(dto, { whitelist: true });
  if (errors.length) {
    throw new BadRequestException(formatValidationErrors(errors));
  }
  return dto;
}

export function formatValidationErrors(errors: ValidationError[]): string {
  const messages: string[] = [];

  const walk = (items: ValidationError[], prefix = '') => {
    for (const item of items) {
      const path = prefix ? `${prefix}.${item.property}` : item.property;
      if (item.constraints) {
        for (const message of Object.values(item.constraints)) {
          messages.push(`${path}: ${message}`);
        }
      }
      if (item.children?.length) walk(item.children, path);
    }
  };

  walk(errors);
  return messages.join('; ') || 'Validation failed';
}
