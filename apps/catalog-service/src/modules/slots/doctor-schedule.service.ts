import { Inject, Injectable } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';

import { slotLabel } from './clinic-time';
import type { DoctorScheduleResponseDto } from './dto/doctor-schedule-response.dto';
import { toScheduleSummaryDto } from './schedule-summary.mapper';
import type { SlotRange } from './slot-range';
import { idsOf, searchActiveSchedules, searchScheduleSlots, withServiceIds } from './slot-search';

/** The PractitionerRole id comes from the token: a doctor can only ever read their own schedules. */
@Injectable()
export class DoctorScheduleService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient) {}

  async forRole(practitionerRoleId: string, range: SlotRange): Promise<DoctorScheduleResponseDto> {
    const schedules = await searchActiveSchedules(this.fhirClient, `PractitionerRole/${practitionerRoleId}`);
    const { slots, truncated } = await searchScheduleSlots(this.fhirClient, idsOf(schedules), range, 'free,busy');
    return {
      practitionerRoleId,
      from: range.from,
      to: range.to,
      schedules: schedules.map(toScheduleSummaryDto),
      items: withServiceIds(slots, schedules).map((slot) => ({ ...slot, label: slotLabel(slot) })),
      ...(truncated ? { truncated } : {}),
    };
  }
}
