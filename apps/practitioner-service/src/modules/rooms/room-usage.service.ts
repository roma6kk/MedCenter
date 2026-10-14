import { Inject, Injectable } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient, type FhirResource, type FhirSearchResult } from '@medcenter/fhir';

import type { RoomUsageResponseDto } from './dto/room-usage-response.dto';
import { doctorsBySchedule, indexByReference, toScheduleUsage, toSlotUsage } from './room-usage.mapper';
import { roomScheduleQuery } from './room-schedules';

/** HAPI's default `max_page_size`; a room is never shared by more schedules. */
export const MAX_ROOM_SCHEDULES = 200;

/** Upcoming bookings listed per room; one more is fetched to detect truncation. */
export const MAX_USAGE_SLOTS = 50;

function resourcesOf(result: FhirSearchResult, resourceType?: string): FhirResource[] {
  const resources = (result.entry ?? []).map((entry) => entry.resource);
  return resourceType === undefined ? resources : resources.filter((resource) => resource.resourceType === resourceType);
}

/**
 * Room occupancy (API §4.7, FR-017): the `Schedule`s that reference the room
 * and their upcoming booked `Slot`s — exactly what makes `DELETE` answer
 * `409 ROOM_IN_USE` (API §4.6), computed by the same query
 * (`roomScheduleQuery`). Read-only, so no AuditEvent (ADR-014 audits writes).
 */
@Injectable()
export class RoomUsageService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient) {}

  async usage(roomId: string, nowMs: number = Date.now()): Promise<RoomUsageResponseDto> {
    // An unknown room surfaces as 404 NOT_FOUND straight from the FHIR client.
    await this.fhirClient.read('Location', roomId);
    // `_include`s bring the role → practitioner and the service, so every
    // schedule line names its doctor and service without extra round trips.
    const result = await this.fhirClient.search('Schedule', {
      ...roomScheduleQuery(roomId),
      _include: 'Schedule:actor',
      '_include:iterate': 'PractitionerRole:practitioner',
      _count: MAX_ROOM_SCHEDULES,
    });
    const schedules = resourcesOf(result, 'Schedule');
    const index = indexByReference(resourcesOf(result));
    const slots = await this.upcomingBookedSlots(schedules, nowMs);
    const doctorBySchedule = doctorsBySchedule(schedules, index);
    return {
      roomId,
      inUse: schedules.length > 0,
      truncated: slots.length > MAX_USAGE_SLOTS,
      items: [
        ...schedules.map((schedule) => toScheduleUsage(schedule, index)),
        ...slots.slice(0, MAX_USAGE_SLOTS).map((slot) => toSlotUsage(slot, doctorBySchedule)),
      ],
    };
  }

  /** Booked slots starting from now, earliest first; `limit + 1` rows reveal truncation. */
  private async upcomingBookedSlots(schedules: readonly FhirResource[], nowMs: number): Promise<FhirResource[]> {
    const references = schedules
      .map((schedule) => schedule.id)
      .filter((id): id is string => id !== undefined && id !== '')
      .map((id) => `Schedule/${id}`);
    if (references.length === 0) {
      return [];
    }
    const result = await this.fhirClient.search('Slot', {
      schedule: references.join(','),
      status: 'busy',
      start: `ge${new Date(nowMs).toISOString()}`,
      _sort: 'start',
      _count: MAX_USAGE_SLOTS + 1,
    });
    return resourcesOf(result, 'Slot');
  }
}
