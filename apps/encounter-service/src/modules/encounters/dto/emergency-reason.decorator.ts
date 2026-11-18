import { applyDecorators } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '@medcenter/common';

// Trimmed first, so padding cannot satisfy the length bounds.
export const EMERGENCY_REASON_MIN = 10;
export const EMERGENCY_REASON_MAX = 500;

export function EmergencyReason(): PropertyDecorator {
  return applyDecorators(
    Trim(),
    IsString(),
    MinLength(EMERGENCY_REASON_MIN),
    MaxLength(EMERGENCY_REASON_MAX),
  );
}
