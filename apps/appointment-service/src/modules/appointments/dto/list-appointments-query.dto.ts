import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

import { PageQueryDto } from './page-query.dto';

/** The `Appointment.status` values this API exposes (`AppointmentResponseDto.status`, API §6). */
export const APPOINTMENT_STATUSES = ['booked', 'cancelled', 'noshow', 'fulfilled'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/**
 * `?status=booked,noshow` or a repeated `?status=booked&status=noshow` into a
 * list without duplicates. A value that is empty as a whole is "no filter"; an empty element of a
 * list (`booked,` or `?status=&status=booked`) is kept and refused by the validator (400), like
 * anything that is not a string (or array of strings).
 */
function toStatusList({ value }: { readonly value: unknown }): unknown {
  const parts = (Array.isArray(value) ? value : [value]) as unknown[];
  if (!parts.every((part) => typeof part === 'string')) {
    return value;
  }
  const items = (parts as string[]).flatMap((part) => part.split(',')).map((item) => item.trim());
  const meaningful = items.length === 1 && items[0] === '' ? [] : items;
  return meaningful.length === 0 ? undefined : [...new Set(meaningful)];
}

/**
 * API §6.2 `GET /appointments?upcoming=&status=&page=&pageSize=&sortOrder=`.
 *
 * There is deliberately no `patient` field: the compartment comes from the
 * token (ADR-013), and the global `whitelist` pipe drops an undeclared
 * `patient` query parameter before it reaches the handler.
 */
export class ListAppointmentsQueryDto extends PageQueryDto {
  /** `true` keeps appointments starting now or later; all appointments otherwise. */
  @IsOptional()
  @IsIn(['true', 'false'])
  upcoming?: 'true' | 'false';

  /** Keeps appointments in any of these statuses (one value or a comma list); every status when absent. */
  @IsOptional()
  @Transform(toStatusList)
  @IsIn(APPOINTMENT_STATUSES, { each: true })
  status?: AppointmentStatus[];
}
