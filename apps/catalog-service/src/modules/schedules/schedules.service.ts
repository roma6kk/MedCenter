import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { buildPaginatedResponse, type PaginatedResponseDto } from '@medcenter/contracts';
import { createAudited, FHIR_CLIENT, updateAudited, type AuditContext, type FhirClient, type FhirResource, type WriteActor } from '@medcenter/fhir';
import { toSlotResponseDto, type SlotResponseDto } from '@medcenter/fhir-mappers';

import { CACHE_KEYS, CACHE_TTLS, RedisCacheService } from '../cache/redis-cache.service';
import type { ScheduleSummaryDto } from '../slots/dto/doctor-schedule-response.dto';
import { toScheduleSummaryDto } from '../slots/schedule-summary.mapper';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import {
  PLANNING_HORIZON_DAYS,
  PLANNING_HORIZON_EXT,
  SLOT_DURATION_EXT,
  WEEKLY_WINDOWS_EXT,
} from './schedule.constants';
import { assertNoScheduleOverlap } from './schedule-overlap';
import { removeScheduleWithSlots } from './schedule-removal';

type Extension = Record<string, unknown>;

/** `AuditEvent.source` of the writes of this service. */
const AUDIT_SOURCE = 'catalog-service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** One page of the admin schedule list in the API §0 envelope. */
export type SchedulePage = PaginatedResponseDto<ScheduleSummaryDto>;

/**
 * Schedule CRUD (API §5.2.1–5.2.4). Creation rejects a schedule whose horizon
 * and weekly windows overlap another one of the same practitioner role with
 * `409 SCHEDULE_OVERLAP` (BR-007). Answers are `ScheduleSummaryDto`s, never raw
 * FHIR resources.
 */
@Injectable()
export class SchedulesService {
  constructor(
    @Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient,
    private readonly cache: RedisCacheService,
  ) {}

  /** Admin writes carry their `AuditEvent` in the same transaction (FR-021, ADR-014). */
  private auditOf(actor: WriteActor): AuditContext {
    return { actor, source: AUDIT_SOURCE };
  }

  async create(dto: CreateScheduleDto, actor: WriteActor): Promise<ScheduleSummaryDto> {
    await assertNoScheduleOverlap(this.fhirClient, {
      practitionerRoleId: dto.practitionerRoleId,
      windows: dto.windows,
      horizon: { start: dto.horizonFrom, end: dto.horizonTo },
    });

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
    return toScheduleSummaryDto(await createAudited(this.fhirClient, schedule, this.auditOf(actor)));
  }

  async update(id: string, dto: UpdateScheduleDto, actor: WriteActor): Promise<ScheduleSummaryDto> {
    const existing = await this.fhirClient.read('Schedule', id);
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
    if (dto.windows !== undefined || dto.horizonFrom !== undefined || dto.horizonTo !== undefined) {
      const current = toScheduleSummaryDto(existing);
      await assertNoScheduleOverlap(this.fhirClient, {
        practitionerRoleId: current.practitionerRoleId ?? '',
        windows: dto.windows ?? current.windows,
        horizon: { start, end },
        excludeScheduleId: id,
      });
    }

    const merged: Record<string, unknown> = { ...existing };
    if (dto.comment !== undefined) {
      merged['comment'] = dto.comment;
    }
    const extensions = this.mergeExtensions(existing, dto, start, end);
    // FHIR JSON forbids empty arrays.
    if (extensions.length > 0) {
      merged['extension'] = extensions;
    } else {
      delete merged['extension'];
    }
    delete merged['slotDurationMin'];
    return toScheduleSummaryDto(await updateAudited(this.fhirClient, { ...merged, id } as FhirResource, this.auditOf(actor)));
  }

  /**
   * Every extension is upserted by its URL, so a PATCH of one of them never
   * drops the others (windows, horizon and duration are independent).
   */
  private mergeExtensions(
    existing: FhirResource,
    dto: UpdateScheduleDto,
    start: string | undefined,
    end: string | undefined,
  ): Extension[] {
    const stored: Extension[] = Array.isArray(existing['extension']) ? (existing['extension'] as Extension[]) : [];
    // The PATCH duration wins, otherwise the stored one (extension or the legacy
    // top-level element) is carried over and migrated into the extension.
    const duration = dto.slotDurationMin ?? this.readStoredDuration(existing);
    const changes: Extension[] = [
      ...(dto.windows === undefined
        ? []
        : [{ url: WEEKLY_WINDOWS_EXT, valueString: JSON.stringify(dto.windows) }]),
      ...(start === undefined && end === undefined
        ? []
        : [{ url: PLANNING_HORIZON_EXT, valuePeriod: { ...(start === undefined ? {} : { start }), ...(end === undefined ? {} : { end }) } }]),
      ...(duration === undefined ? [] : [{ url: SLOT_DURATION_EXT, valueInteger: duration }]),
    ];
    return changes.reduce((extensions, change) => this.upsertExtension(extensions, change), [...stored]);
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

  /** API §5.2.2 — schedule list, optionally filtered by doctor / active flag, in the API §0 envelope. */
  async list(page: number, pageSize: number, doctorId?: string, active?: string): Promise<SchedulePage> {
    const result = await this.fhirClient.search('Schedule', {
      ...(doctorId === undefined ? {} : { actor: `PractitionerRole/${doctorId}` }),
      ...(active === undefined ? {} : { active }),
      _sort: '_id',
      _count: pageSize,
      _offset: (page - 1) * pageSize,
      _total: 'accurate',
    });
    const items = (result.entry ?? []).map((entry) => toScheduleSummaryDto(entry.resource));
    const totalItems = result.total ?? (page - 1) * pageSize + items.length;
    return buildPaginatedResponse(items, { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) });
  }

  /** API §5.2.4: busy slots protect the schedule, free ones go with `cascade` (see `removeScheduleWithSlots`). */
  async remove(id: string, cascade: boolean, actor: WriteActor): Promise<void> {
    await removeScheduleWithSlots(this.fhirClient, id, cascade, this.auditOf(actor));
    await this.cache.invalidate([CACHE_KEYS.SCHEDULE_SLOTS(id), CACHE_KEYS.ALL_DOCTOR_SLOTS]);
  }

  /** Slots of a schedule, cached for 15 s (NFR-005). Without a `status` the answer is free and busy
   *  slots only (the two-state contract): a slot retired by a schedule removal (`entered-in-error`)
   *  appears only when asked for. The cache key includes the status filter — otherwise the first
   *  filtered query caches a free-only slice under the shared key and unfiltered callers receive it. */
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
        status: status ?? 'free,busy',
      });
      return (result.entry ?? [])
        .map((entry) => toSlotResponseDto(entry.resource))
        .sort((a, b) => a.start.localeCompare(b.start));
    });
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
