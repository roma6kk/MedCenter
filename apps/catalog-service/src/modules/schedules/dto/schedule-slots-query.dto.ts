import { IsDateString, IsOptional, Matches } from 'class-validator';

import { DATE_OR_ZONED_DATE_TIME } from '../../../common/zoned-date';

/** R4 `Slot.status` values, comma-separated (an OR in FHIR search). */
const SLOT_STATUS_LIST =
  /^(busy|free|busy-unavailable|busy-tentative|entered-in-error)(,(busy|free|busy-unavailable|busy-tentative|entered-in-error))*$/;

/**
 * `?from=&to=&status=` of API §5.2.6. The values go into the HAPI search and into
 * the cache key, so each one is checked against a closed format: nothing else
 * reaches `start=ge{from}` or `status=`, and a malformed value is a 400 rather
 * than a HAPI error that surfaces as 500.
 */
export class ScheduleSlotsQueryDto {
  @IsDateString({ strict: true })
  @Matches(DATE_OR_ZONED_DATE_TIME, { message: 'from must be a date or a date-time with an offset' })
  from!: string;

  @IsDateString({ strict: true })
  @Matches(DATE_OR_ZONED_DATE_TIME, { message: 'to must be a date or a date-time with an offset' })
  to!: string;

  @IsOptional()
  @Matches(SLOT_STATUS_LIST, { message: 'status must be one or more Slot statuses separated by commas' })
  status?: string;
}
