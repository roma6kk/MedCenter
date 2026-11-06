import { BadRequestException, ValidationPipe, type ValidationError } from '@nestjs/common';
import type { FieldErrorDetail } from '@medcenter/contracts';

export function toFieldErrors(errors: readonly ValidationError[], parent = ''): FieldErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parent === '' ? error.property : `${parent}.${error.property}`;
    const own = Object.values(error.constraints ?? {}).map((message): FieldErrorDetail => ({ field, message }));
    return [...own, ...toFieldErrors(error.children ?? [], field)];
  });
}

export function validationException(errors: readonly ValidationError[]): BadRequestException {
  const details = toFieldErrors(errors);
  return new BadRequestException({
    errorCode: 'VALIDATION_ERROR',
    message: details.map((detail) => `${detail.field}: ${detail.message}`).join('; '),
    details,
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: false,
    exceptionFactory: validationException,
  });
}
