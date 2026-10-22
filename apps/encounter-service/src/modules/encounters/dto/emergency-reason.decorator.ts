import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** API §7.1/7.3 `emergencyReason`: trimmed first, so padding cannot satisfy the length bounds. */
export const EMERGENCY_REASON_MIN = 10;
export const EMERGENCY_REASON_MAX = 500;

export function EmergencyReason(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)),
    IsString(),
    MinLength(EMERGENCY_REASON_MIN),
    MaxLength(EMERGENCY_REASON_MAX),
  );
}
