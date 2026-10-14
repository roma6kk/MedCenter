import { Inject, Injectable } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';

import { slotLabel } from './clinic-time';
import type { DoctorScheduleResponseDto } from './dto/doctor-schedule-response.dto';
import { toScheduleSummaryDto } from './schedule-summary.mapper';
import type { SlotRange } from './slot-range';
import { idsOf, searchActiveSchedules, searchScheduleSlots } from './slot-search';

/**
 * The signed-in doctor's own schedule (API §5.2.7, FR-009). The caller passes
 * the PractitionerRole id taken from the token (`requirePractitionerRoleId`),
 * so a doctor can only ever read the schedules where that role is the actor.
 * Not cached: the doctor must see a booking the moment it lands.
 */
@Injectable()
export class DoctorScheduleService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient) {}

  async forRole(practitionerRoleId: string, range: SlotRange): Promise<DoctorScheduleResponseDto> {
    const schedules = await searchActiveSchedules(this.fhirClient, `PractitionerRole/${practitionerRoleId}`);
    // Free and busy only: `busy-unavailable` / `entered-in-error` are not part
    // of the two-state SlotResponseDto contract.
    const { slots, truncated } = await searchScheduleSlots(this.fhirClient, idsOf(schedules), range, 'free,busy');
    return {
      practitionerRoleId,
      from: range.from,
      to: range.to,
      schedules: schedules.map(toScheduleSummaryDto),
      items: slots.map((slot) => ({ ...slot, label: slotLabel(slot) })),
      ...(truncated ? { truncated } : {}),
    };
  }
}
