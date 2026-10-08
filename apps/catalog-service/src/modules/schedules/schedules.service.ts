import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { toSlotResponseDto, type SlotResponseDto } from '@medcenter/fhir-mappers';

import { CACHE_KEYS, CACHE_TTLS, RedisCacheService } from '../cache/redis-cache.service';
import { CreateScheduleDto, type WeeklyWindowDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import {
  PLANNING_HORIZON_DAYS,
  PLANNING_HORIZON_EXT,
  SLOT_DURATION_EXT,
  WEEKLY_WINDOWS_EXT,
} from './schedule.constants';

type Extension = Record<string, unknown>;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Schedule CRUD (API §5.2.1–5.2.4). Creation rejects overlapping weekly
 * windows for the same practitioner role with `409 SCHEDULE_OVERLAP` (BR-007).
 */
@Injectable()
export class SchedulesService {
  constructor(
    @Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient,
    private readonly cache: RedisCacheService,
  ) {}

  async create(dto: CreateScheduleDto): Promise<FhirResource> {
    await this.assertNoOverlap(dto.practitionerRoleId, dto.windows);

    const schedule: FhirResource = {
      resourceType: 'Schedule',
      active: true,
      actor: [
        { reference: `PractitionerRole/${dto.practitionerRoleId}` },
        { reference: `Location/${dto.roomId}` },
        { reference: `HealthcareService/${dto.serviceId}` },
      ],
      // `slotDurationMin` is not a native Schedule element in FHIR R4 —
      // a strict HAPI would reject the resource. It lives in an extension
      // (like the planning horizon) and the slot generator reads it back from there.
      extension: [
        { url: SLOT_DURATION_EXT, valueInteger: dto.slotDurationMin },
        { url: WEEKLY_WINDOWS_EXT, valueString: JSON.stringify(dto.windows) },
        { url: PLANNING_HORIZON_EXT, valuePeriod: { start: dto.horizonFrom, end: dto.horizonTo } },
      ],
      ...(dto.comment === undefined ? {} : { comment: dto.comment }),
    };
    return this.fhirClient.create('Schedule', schedule);
  }

  async update(id: string, dto: UpdateScheduleDto): Promise<FhirResource> {
    const existing = await this.fhirClient.read('Schedule', id);
    if (dto.windows !== undefined) {
      await this.assertNoOverlap(this.readRoleId(existing), dto.windows, id);
    }
    // Partial PATCH semantics: a supplied horizon bound replaces its half of
    // the stored valuePeriod, the other half survives. The 90-day guard runs
    // on the merged period — checking the DTO alone let a single-bound PATCH
    // (e.g. only horizonTo) stretch the horizon arbitrarily.
    const storedPeriod = this.findHorizonPeriod(existing);
    const start = dto.horizonFrom ?? storedPeriod?.start;
    const end = dto.horizonTo ?? storedPeriod?.end;
    if (dto.horizonFrom !== undefined || dto.horizonTo !== undefined) {
      this.assertHorizonSpan(start, end);
    }

    const merged: Record<string, unknown> = { ...existing };
    if (dto.comment !== undefined) {
      merged['comment'] = dto.comment;
    }
    // Every extension is upserted by its URL, so a PATCH of one of them never
    // drops the others (windows, horizon and duration are independent).
    let extensions: Extension[] = Array.isArray(existing['extension'])
      ? [...(existing['extension'] as Extension[])]
      : [];
    if (dto.windows !== undefined) {
      extensions = this.upsertExtension(extensions, {
        url: WEEKLY_WINDOWS_EXT,
        valueString: JSON.stringify(dto.windows),
      });
    }
    if (start !== undefined || end !== undefined) {
      extensions = this.upsertExtension(extensions, {
        url: PLANNING_HORIZON_EXT,
        valuePeriod: {
          ...(start !== undefined ? { start } : {}),
          ...(end !== undefined ? { end } : {}),
        },
      });
    }
    // The PATCH value wins, otherwise the stored one (extension or the legacy
    // top-level element) is carried over and migrated into the extension.
    const duration = dto.slotDurationMin ?? this.readStoredDuration(existing);
    if (duration !== undefined) {
      extensions = this.upsertExtension(extensions, {
        url: SLOT_DURATION_EXT,
        valueInteger: duration,
      });
    }
    // FHIR JSON forbids empty arrays.
    if (extensions.length > 0) {
      merged['extension'] = extensions;
    } else {
      delete merged['extension'];
    }
    delete merged['slotDurationMin'];
    return this.fhirClient.update('Schedule', id, merged as FhirResource);
  }

  private upsertExtension(extensions: readonly Extension[], extension: Extension): Extension[] {
    return [...extensions.filter((ext) => ext['url'] !== extension['url']), extension];
  }

  /** Reads the stored slot duration from the extension or the legacy
   *  top-level element written before the extension was introduced. */
  private readStoredDuration(schedule: FhirResource): number | undefined {
    const extensions = schedule['extension'];
    if (Array.isArray(extensions)) {
      const ext = (extensions as Array<Record<string, unknown>>).find(
        (candidate) => candidate['url'] === SLOT_DURATION_EXT,
      );
      if (typeof ext?.['valueInteger'] === 'number') {
        return ext['valueInteger'] as number;
      }
    }
    const value = schedule['slotDurationMin'];
    return typeof value === 'number' ? value : undefined;
  }

  /** The horizon must not exceed the 90-day planning span (API §5.2.3). */
  private assertHorizonSpan(start: string | undefined, end: string | undefined): void {
    const from = Date.parse(start ?? '');
    const to = Date.parse(end ?? '');
    if (Number.isFinite(from) && Number.isFinite(to)) {
      const spanDays = (to - from) / DAY_MS;
      if (spanDays < 0 || spanDays > PLANNING_HORIZON_DAYS) {
        throw new BadRequestException({
          errorCode: 'VALIDATION_ERROR',
          message: `planningHorizon: range must be within ${PLANNING_HORIZON_DAYS} days`,
        });
      }
    }
  }

  /** API §5.2.2 — schedule list, optionally filtered by doctor / active flag. */
  async list(doctorId?: string, active?: string): Promise<FhirResource[]> {
    const result = await this.fhirClient.search('Schedule', {
      ...(doctorId === undefined ? {} : { actor: `PractitionerRole/${doctorId}` }),
      ...(active === undefined ? {} : { active }),
    });
    return (result.entry ?? []).map((entry) => entry.resource);
  }

  async remove(id: string, cascade: boolean): Promise<void> {
    const busy = await this.fhirClient.search('Slot', {
      schedule: `Schedule/${id}`,
      status: 'busy',
    });
    if ((busy.entry ?? []).length > 0 && !cascade) {
      throw new ConflictException({
        errorCode: 'SCHEDULE_IN_USE',
        message: `SCHEDULE_IN_USE: schedule ${id} has busy slots`,
      });
    }
    await this.fhirClient.delete('Schedule', id);
    await this.cache.invalidate([CACHE_KEYS.SCHEDULE_SLOTS(id)]);
  }

  /** Free slots of a schedule, cached for 15 s (NFR-005). The cache key
   *  includes the status filter — otherwise the first filtered query caches a
   *  free-only slice under the shared key and unfiltered callers receive it. */
  async listSlots(
    scheduleId: string,
    from: string,
    to: string,
    status?: string,
  ): Promise<SlotResponseDto[]> {
    const key = CACHE_KEYS.SLOTS(scheduleId, from, `${to}:${status ?? 'all'}`);
    return this.cache.getOrLoad(key, CACHE_TTLS.SLOTS_SECONDS, async () => {
      const result = await this.fhirClient.search('Slot', {
        schedule: `Schedule/${scheduleId}`,
        start: [`ge${from}`, `le${to}`],
        ...(status === undefined ? {} : { status }),
      });
      return (result.entry ?? [])
        .map((entry) => toSlotResponseDto(entry.resource))
        .sort((a, b) => a.start.localeCompare(b.start));
    });
  }

  /**
   * BR-007: no two active windows of the same practitioner role may overlap.
   * Overlap is checked per day-of-week, minute-range intersection.
   */
  private async assertNoOverlap(
    practitionerRoleId: string,
    windows: readonly WeeklyWindowDto[],
    excludeScheduleId?: string,
  ): Promise<void> {
    if (this.hasInternalOverlap(windows)) {
      throw new ConflictException({
        errorCode: 'SCHEDULE_OVERLAP',
        message: 'SCHEDULE_OVERLAP: weekly windows intersect',
      });
    }

    const existing = await this.fhirClient.search('Schedule', {
      actor: `PractitionerRole/${practitionerRoleId}`,
      active: 'true',
    });
    for (const entry of existing.entry ?? []) {
      if (entry.resource.id === excludeScheduleId) {
        continue;
      }
      const existingWindows = this.readWindows(entry.resource);
      if (this.hasCrossOverlap(windows, existingWindows)) {
        throw new ConflictException({
          errorCode: 'SCHEDULE_OVERLAP',
          message: `SCHEDULE_OVERLAP: practitioner role ${practitionerRoleId} already has a schedule`,
        });
      }
    }
  }

  private hasInternalOverlap(windows: readonly WeeklyWindowDto[]): boolean {
    for (let i = 0; i < windows.length; i += 1) {
      for (let j = i + 1; j < windows.length; j += 1) {
        const a = windows[i];
        const b = windows[j];
        if (a !== undefined && b !== undefined && this.intersects(a, b)) {
          return true;
        }
      }
    }
    return false;
  }

  private hasCrossOverlap(
    candidate: readonly WeeklyWindowDto[],
    existing: readonly WeeklyWindowDto[],
  ): boolean {
    return candidate.some((a) => existing.some((b) => this.intersects(a, b)));
  }

  private intersects(a: WeeklyWindowDto, b: WeeklyWindowDto): boolean {
    if (a.dayOfWeek !== b.dayOfWeek) {
      return false;
    }
    const aStart = this.toMinutes(a.startTime);
    const aEnd = this.toMinutes(a.endTime);
    const bStart = this.toMinutes(b.startTime);
    const bEnd = this.toMinutes(b.endTime);
    return aStart < bEnd && bStart < aEnd;
  }

  private toMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private readWindows(schedule: FhirResource): WeeklyWindowDto[] {
    const extensions = schedule['extension'];
    if (!Array.isArray(extensions)) {
      return [];
    }
    const horizon = (extensions as Array<Record<string, unknown>>).find(
      (ext) => ext['url'] === WEEKLY_WINDOWS_EXT && typeof ext['valueString'] === 'string',
    );
    if (horizon === undefined) {
      return [];
    }
    try {
      return JSON.parse(horizon['valueString'] as string) as WeeklyWindowDto[];
    } catch {
      return [];
    }
  }

  private readRoleId(schedule: FhirResource): string {
    const actors = schedule['actor'];
    if (!Array.isArray(actors)) {
      return '';
    }
    const role = (actors as Array<{ reference?: string }>).find((actor) =>
      actor.reference?.startsWith('PractitionerRole/'),
    );
    return role?.reference?.split('/')[1] ?? '';
  }

  /** Reads the planning-horizon valuePeriod stored on a schedule, if any. */
  private findHorizonPeriod(
    schedule: FhirResource,
  ): { start?: string; end?: string } | undefined {
    if (!Array.isArray(schedule['extension'])) {
      return undefined;
    }
    const ext = (schedule['extension'] as Array<Record<string, unknown>>).find(
      (candidate) => candidate['url'] === PLANNING_HORIZON_EXT && 'valuePeriod' in candidate,
    );
    return ext === undefined ? undefined : (ext['valuePeriod'] as { start?: string; end?: string });
  }
}
