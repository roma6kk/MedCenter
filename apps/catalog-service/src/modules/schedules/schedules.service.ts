import { BadRequestException, HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { buildPaginatedResponse, type PaginatedResponseDto } from '@medcenter/contracts';
import { createAudited, FHIR_CLIENT, updateAudited, type AuditContext, type FhirClient, type FhirResource, type WriteActor } from '@medcenter/fhir';
import { type SlotResponseDto } from '@medcenter/fhir-mappers';

import { FHIR_PAGE_SIZE } from '../../common/fhir-search';
import { CACHE_KEYS, CACHE_TTLS, RedisCacheService } from '../cache/redis-cache.service';
import type { ScheduleSummaryDto } from '../slots/dto/doctor-schedule-response.dto';
import { toScheduleSummaryDto } from '../slots/schedule-summary.mapper';
import { clinicDayRange } from '../slots/slot-range';
import { SLOT_SEARCH_MAX_PAGES, searchScheduleSlots } from '../slots/slot-search';
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

const AUDIT_SOURCE = 'catalog-service';

const DAY_MS = 24 * 60 * 60 * 1000;

export type SchedulePage = PaginatedResponseDto<ScheduleSummaryDto>;

@Injectable()
export class SchedulesService {
  constructor(
    @Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient,
    private readonly cache: RedisCacheService,
  ) {}

  private auditOf(actor: WriteActor): AuditContext {
    return { actor, source: AUDIT_SOURCE };
  }

  async create(dto: CreateScheduleDto, actor: WriteActor): Promise<ScheduleSummaryDto> {
    this.assertHorizonSpan(dto.horizonFrom, dto.horizonTo);
    await this.assertActorsExist(dto);
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
      // `slotDurationMin` is not a native R4 Schedule element: a strict HAPI would reject it, so it lives in an extension.
      extension: [
        { url: SLOT_DURATION_EXT, valueInteger: dto.slotDurationMin },
        { url: WEEKLY_WINDOWS_EXT, valueString: JSON.stringify(dto.windows) },
        { url: PLANNING_HORIZON_EXT, valuePeriod: { start: dto.horizonFrom, end: dto.horizonTo } },
      ],
      ...(dto.comment === undefined ? {} : { comment: dto.comment }),
    };
    return toScheduleSummaryDto(await createAudited(this.fhirClient, schedule, this.auditOf(actor)));
  }

  /** A missing reference would reach HAPI as a refused write and come back as a 500: name it as a 404 instead. */
  private async assertActorsExist(dto: CreateScheduleDto): Promise<void> {
    const references = [
      { field: 'practitionerRoleId', type: 'PractitionerRole', id: dto.practitionerRoleId },
      { field: 'roomId', type: 'Location', id: dto.roomId },
      { field: 'serviceId', type: 'HealthcareService', id: dto.serviceId },
    ] as const;
    await Promise.all(
      references.map(async ({ field, type, id }) => {
        try {
          await this.fhirClient.read(type, id);
        } catch (error: unknown) {
          if (error instanceof HttpException && error.getStatus() === 404) {
            throw new NotFoundException({ errorCode: 'NOT_FOUND', message: `NOT_FOUND: ${field} ${id} does not exist (${type})` });
          }
          throw error;
        }
      }),
    );
  }

  async update(id: string, dto: UpdateScheduleDto, actor: WriteActor): Promise<ScheduleSummaryDto> {
    const existing = await this.fhirClient.read('Schedule', id);
    // A PATCH bound replaces its half of the stored period; the 90-day guard runs on the merged period, not the DTO alone.
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

  private mergeExtensions(
    existing: FhirResource,
    dto: UpdateScheduleDto,
    start: string | undefined,
    end: string | undefined,
  ): Extension[] {
    const stored: Extension[] = Array.isArray(existing['extension']) ? (existing['extension'] as Extension[]) : [];
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

  async list(page: number, pageSize: number, doctorId?: string, active?: string): Promise<SchedulePage> {
    const result = await this.fhirClient.search('Schedule', {
      ...(doctorId === undefined ? {} : { actor: `PractitionerRole/${doctorId}` }),
      ...(active === undefined ? {} : { active }),
      // `_id` (a random UUID) only breaks ties so a page boundary stays stable.
      _sort: '-_lastUpdated,_id',
      _count: pageSize,
      _offset: (page - 1) * pageSize,
      _total: 'accurate',
    });
    const items = (result.entry ?? []).map((entry) => toScheduleSummaryDto(entry.resource));
    const totalItems = result.total ?? (page - 1) * pageSize + items.length;
    return buildPaginatedResponse(items, { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) });
  }

  async remove(id: string, cascade: boolean, actor: WriteActor): Promise<boolean> {
    const deactivated = await removeScheduleWithSlots(this.fhirClient, id, cascade, this.auditOf(actor));
    await this.cache.invalidate([CACHE_KEYS.SCHEDULE_SLOTS(id), CACHE_KEYS.ALL_DOCTOR_SLOTS]);
    return deactivated;
  }

  async listSlots(
    scheduleId: string,
    from: string,
    to: string,
    status?: string,
  ): Promise<SlotResponseDto[]> {
    const key = CACHE_KEYS.SLOTS(scheduleId, from, `${to}:${status ?? 'all'}`);
    return this.cache.getOrLoad(key, CACHE_TTLS.SLOTS_SECONDS, async () => {
      await this.fhirClient.read('Schedule', scheduleId);
      const { slots, truncated } = await searchScheduleSlots(
        this.fhirClient,
        [scheduleId],
        clinicDayRange(from, to),
        status ?? 'free,busy',
      );
      if (truncated) {
        // A bare array: a silent cut would show a partial grid as the whole one.
        throw new BadRequestException({
          errorCode: 'VALIDATION_ERROR',
          message: `range: more than ${SLOT_SEARCH_MAX_PAGES * FHIR_PAGE_SIZE} slots, ask for a shorter period`,
        });
      }
      return slots;
    });
  }

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
