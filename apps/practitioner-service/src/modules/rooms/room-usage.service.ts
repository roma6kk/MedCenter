import { Inject, Injectable } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient, type FhirResource, type FhirSearchResult } from '@medcenter/fhir';
import { DEFAULT_CONTENT_LANGUAGE, type ContentLanguage } from '@medcenter/fhir-mappers';

import type { RoomUsageResponseDto } from './dto/room-usage-response.dto';
import {
  doctorsBySchedule,
  indexByReference,
  toRoleUsage,
  toScheduleUsage,
  toServiceUsage,
  toSlotUsage,
} from './room-usage.mapper';
import { roomReferrerQuery } from './room-references';
import { readRoom } from './room-search';

export const MAX_ROOM_SCHEDULES = 200;

export const MAX_USAGE_SLOTS = 50;

function resourcesOf(result: FhirSearchResult, resourceType?: string): FhirResource[] {
  const resources = (result.entry ?? []).map((entry) => entry.resource);
  return resourceType === undefined ? resources : resources.filter((resource) => resource.resourceType === resourceType);
}

@Injectable()
export class RoomUsageService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient) {}

  async usage(
    roomId: string,
    lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE,
    nowMs: number = Date.now(),
  ): Promise<RoomUsageResponseDto> {
    await readRoom(this.fhirClient, roomId);
    const [scheduleResult, roleResult, serviceResult] = await Promise.all([
      this.fhirClient.search('Schedule', {
        ...roomReferrerQuery('Schedule', roomId),
        _include: 'Schedule:actor',
        '_include:iterate': 'PractitionerRole:practitioner',
        _count: MAX_ROOM_SCHEDULES,
      }),
      this.fhirClient.search('PractitionerRole', {
        ...roomReferrerQuery('PractitionerRole', roomId),
        _include: 'PractitionerRole:practitioner',
        _count: MAX_ROOM_SCHEDULES,
      }),
      this.fhirClient.search('HealthcareService', {
        ...roomReferrerQuery('HealthcareService', roomId),
        _count: MAX_ROOM_SCHEDULES,
      }),
    ]);
    const schedules = resourcesOf(scheduleResult, 'Schedule');
    const roles = resourcesOf(roleResult, 'PractitionerRole');
    const services = resourcesOf(serviceResult, 'HealthcareService');
    const index = indexByReference([...resourcesOf(scheduleResult), ...resourcesOf(roleResult)]);
    const slots = await this.upcomingBookedSlots(schedules, nowMs);
    const doctorBySchedule = doctorsBySchedule(schedules, index, lang);
    return {
      roomId,
      inUse: schedules.length + roles.length + services.length > 0,
      truncated: slots.length > MAX_USAGE_SLOTS,
      items: [
        ...schedules.map((schedule) => toScheduleUsage(schedule, index, lang)),
        ...roles.map((role) => toRoleUsage(role, index, lang)),
        ...services.map((service) => toServiceUsage(service, lang)),
        ...slots.slice(0, MAX_USAGE_SLOTS).map((slot) => toSlotUsage(slot, doctorBySchedule, lang)),
      ],
    };
  }

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
