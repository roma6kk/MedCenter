import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

import { PageQueryDto } from './page-query.dto';

export const APPOINTMENT_STATUSES = ['booked', 'cancelled', 'noshow', 'fulfilled'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export function toStatusList({ value }: { readonly value: unknown }): unknown {
  const parts = (Array.isArray(value) ? value : [value]) as unknown[];
  if (!parts.every((part) => typeof part === 'string')) {
    return value;
  }
  const items = (parts as string[]).flatMap((part) => part.split(',')).map((item) => item.trim());
  const meaningful = items.length === 1 && items[0] === '' ? [] : items;
  return meaningful.length === 0 ? undefined : [...new Set(meaningful)];
}

/** No `patient` field on purpose: the compartment comes from the token and `whitelist` drops the parameter. */
export class ListAppointmentsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'true keeps appointments starting now or later',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  upcoming?: 'true' | 'false';

  @ApiPropertyOptional({
    type: String,
    isArray: true,
    enum: APPOINTMENT_STATUSES,
    enumName: 'AppointmentStatus',
    description: 'One status or a comma list (OR); repeated parameters are accepted too',
    example: 'booked,noshow',
  })
  @IsOptional()
  @Transform(toStatusList)
  @IsIn(APPOINTMENT_STATUSES, { each: true })
  status?: AppointmentStatus[];
}
