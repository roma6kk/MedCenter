import { createHash } from 'node:crypto';

import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { clinicDateOf, clinicDayEndMs, clinicDaysBetween, clinicDayStartMs } from '@medcenter/common';
import { buildWriteAuditEvent, commitTransaction, FHIR_CLIENT, type FhirClient, type FhirResource, type WriteActor } from '@medcenter/fhir';
import { MEDCENTER_EXT } from '@medcenter/terminology';

import { AUDIT_SOURCE } from '../../common/audit';
import { searchPages } from '../../common/fhir-search';
import { CACHE_KEYS, RedisCacheService } from '../cache/redis-cache.service';
import { findExtension, toScheduleSummaryDto } from '../slots/schedule-summary.mapper';
import { GenerateSlotsDto } from './dto/generate-slots.dto';
import type { WeeklyWindowDto } from './dto/create-schedule.dto';
import { PLANNING_HORIZON_DAYS, SLOT_DURATION_EXT, WEEKLY_WINDOWS_EXT } from './schedule.constants';
import { writeSlotBatches } from './slot-batch-writer';
import { planSlots, type PlannedSlot } from './slot-planner';

const DAY_MS = 24 * 60 * 60 * 1000;
export const EXISTING_SLOT_MAX_PAGES = 150;

interface ExistingSlot {
  readonly startMs: number;
  readonly endMs: number;
  readonly retired: boolean;
}

export interface GenerateSlotsResult {
  readonly generated: number;
  readonly skipped: number;
}

interface ScheduleActors {
  readonly actor?: ReadonlyArray<{ readonly reference?: string }>;
}

@Injectable()
export class SlotGeneratorService {
  private readonly logger = new Logger(SlotGeneratorService.name);

  constructor(
    @Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient,
    private readonly cache: RedisCacheService,
  ) {}

  async generate(scheduleId: string, dto: GenerateSlotsDto, actor: WriteActor): Promise<GenerateSlotsResult> {
    this.assertWithinHorizon(dto);

    const schedule = await this.fhirClient.read('Schedule', scheduleId);
    this.assertActive(scheduleId, schedule);
    this.assertInsideScheduleHorizon(schedule, dto);
    const fromMs = Date.parse(dto.from);
    const toMs = Date.parse(dto.to);
    const planned = planSlots(
      fromMs,
      toMs,
      this.readWindows(scheduleId, schedule),
      this.readSlotDuration(schedule),
    );

    const existing = await this.findExistingSlots(scheduleId, fromMs, toMs);
    const overlapping = overlapFilter(existing);
    const fresh = planned.filter((slot) => !overlapping(Date.parse(slot.start), Date.parse(slot.end)));
    this.warnOnUnplannedSlots(scheduleId, planned, existing, planned.length - fresh.length);
    const resources = fresh.map((slot) => this.toSlotResource(scheduleId, schedule, slot));
    const { generated, failures } = await writeSlotBatches(this.fhirClient, resources);
    if (generated > 0) {
      await this.cache.invalidate([CACHE_KEYS.SCHEDULE_SLOTS(scheduleId), CACHE_KEYS.ALL_DOCTOR_SLOTS]);
      await this.auditGeneration(scheduleId, dto, actor, generated, planned.length - generated);
    }
    if (failures.length > 0) {
      throw this.partialFailure(scheduleId, generated, failures);
    }

    return { generated, skipped: planned.length - generated };
  }

  private async auditGeneration(
    scheduleId: string,
    dto: GenerateSlotsDto,
    actor: WriteActor,
    generated: number,
    skipped: number,
  ): Promise<void> {
    const event = {
      ...buildWriteAuditEvent({ interaction: 'create', actor, resourceType: 'Schedule', resourceId: scheduleId, source: AUDIT_SOURCE }),
      outcomeDesc: `slots generated: ${generated}, skipped: ${skipped}, ${dto.from}..${dto.to}`,
    };
    try {
      await commitTransaction(this.fhirClient, [{ method: 'POST', url: 'AuditEvent', resource: event }], 'CONFLICT');
    } catch (error: unknown) {
      this.logger.error(
        { scheduleId, err: error instanceof Error ? error.message : String(error) },
        'Slots were generated but their AuditEvent was not written',
      );
    }
  }

  /** A batch is not atomic: partly written slots are a failure the admin must see, not "skipped". Generation is idempotent, so a re-run is safe. */
  private partialFailure(scheduleId: string, generated: number, failures: readonly string[]): BadGatewayException {
    const reasons = [...new Set(failures)].slice(0, 5);
    this.logger.warn(
      { scheduleId, generated, failed: failures.length, reasons },
      'HAPI did not confirm every slot of the generated range',
    );
    return new BadGatewayException({
      errorCode: 'INTERNAL',
      message: `${failures.length} slots were not written (${generated} were); run the same range again to write the rest`,
    });
  }

  private warnOnUnplannedSlots(
    scheduleId: string,
    planned: readonly PlannedSlot[],
    existing: readonly ExistingSlot[],
    skippedTotal: number,
  ): void {
    const plannedStarts = new Set(planned.map((slot) => Date.parse(slot.start)));
    const unplanned = existing.filter((slot) => !plannedStarts.has(slot.startMs)).length;
    if (unplanned > 0) {
      this.logger.warn(
        { scheduleId, unplanned, existing: existing.length, skipped: skippedTotal },
        'Schedule has slots its weekly windows do not plan (windows edited, or slots made when windows were read as UTC); planned slots that overlap them are skipped',
      );
    }
  }

  private async findExistingSlots(scheduleId: string, fromMs: number, toMs: number): Promise<ExistingSlot[]> {
    const days = clinicDaysBetween(fromMs, toMs);
    const first = days[0];
    const last = days[days.length - 1];
    if (first === undefined || last === undefined) {
      return [];
    }
    const { resources: existing, truncated } = await searchPages(
      this.fhirClient,
      'Slot',
      {
        schedule: `Schedule/${scheduleId}`,
        start: [`ge${new Date(clinicDayStartMs(first)).toISOString()}`, `le${new Date(clinicDayEndMs(last)).toISOString()}`],
        _sort: 'start,_id',
      },
      { maxPages: EXISTING_SLOT_MAX_PAGES },
    );
    if (truncated) {
      // Writing on top of a partial list could overwrite a booked slot with a free one (BR-001).
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: 'range: the schedule has too many slots in this range to compare safely; generate a shorter range',
      });
    }
    return existing
      .map((slot): ExistingSlot => {
        const startMs = Date.parse(String(slot['start']));
        const endMs = Date.parse(String(slot['end']));
        return { startMs, endMs: Number.isFinite(endMs) ? endMs : startMs + 1, retired: slot['status'] === 'entered-in-error' };
      })
      .filter((slot) => Number.isFinite(slot.startMs));
  }

  private toSlotResource(scheduleId: string, schedule: FhirResource, slot: PlannedSlot): FhirResource {
    const actors = (schedule as ScheduleActors).actor ?? [];
    return {
      resourceType: 'Slot',
      id: this.slotId(scheduleId, slot.start),
      schedule: { reference: `Schedule/${scheduleId}` },
      status: 'free',
      start: slot.start,
      end: slot.end,
      ...(actors.length === 0
        ? {}
        : { extension: [{ url: MEDCENTER_EXT.SLOT_ACTORS, valueString: JSON.stringify(actors) }] }),
    };
  }

  private assertActive(scheduleId: string, schedule: FhirResource): void {
    if (schedule['active'] === false) {
      throw new ConflictException({
        errorCode: 'CONFLICT',
        message: `CONFLICT: schedule ${scheduleId} is deactivated (removed); create a new schedule to generate slots`,
      });
    }
  }

  private assertInsideScheduleHorizon(schedule: FhirResource, dto: GenerateSlotsDto): void {
    const { horizonFrom, horizonTo } = toScheduleSummaryDto(schedule);
    const from = horizonFrom === undefined ? undefined : clinicDayOf(horizonFrom);
    const to = horizonTo === undefined ? undefined : clinicDayOf(horizonTo);
    const first = clinicDayOf(dto.from);
    const last = clinicDayOf(dto.to);
    if ((from !== undefined && first < from) || (to !== undefined && last > to)) {
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: `planningHorizon: range must be inside the schedule horizon (${from ?? '...'}..${to ?? '...'})`,
      });
    }
  }

  private assertWithinHorizon(dto: GenerateSlotsDto): void {
    const from = Date.parse(dto.from);
    const to = Date.parse(dto.to);
    const spanDays = (to - from) / DAY_MS;
    if (!Number.isFinite(spanDays) || spanDays < 0 || spanDays > PLANNING_HORIZON_DAYS) {
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: `planningHorizon: range must be within ${PLANNING_HORIZON_DAYS} days`,
      });
    }
  }

  /** Deterministic id (same schedule + start): a raw concatenation with `:` is not a valid FHIR id. */
  private slotId(scheduleId: string, start: string): string {
    return createHash('sha256').update(`${scheduleId}|${start}`).digest('hex').slice(0, 64);
  }

  private readWindows(scheduleId: string, schedule: FhirResource): WeeklyWindowDto[] {
    const raw = findExtension(schedule, WEEKLY_WINDOWS_EXT)?.['valueString'];
    if (typeof raw !== 'string') {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as WeeklyWindowDto[]) : [];
    } catch (error: unknown) {
      this.logger.warn(
        { scheduleId, err: error instanceof Error ? error.message : String(error) },
        'Weekly windows of the schedule are not valid JSON; nothing to generate',
      );
      return [];
    }
  }

  private readSlotDuration(schedule: FhirResource): number {
    const stored = findExtension(schedule, SLOT_DURATION_EXT)?.['valueInteger'] ?? schedule['slotDurationMin'];
    return typeof stored === 'number' ? stored : 30;
  }
}

function clinicDayOf(bound: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(bound) ? bound : clinicDateOf(Date.parse(bound));
}

/** A slot of any status with the same start collides (so its id is never rewritten), and so does an overlap with a live one. */
function overlapFilter(existing: readonly ExistingSlot[]): (startMs: number, endMs: number) => boolean {
  const starts = new Set(existing.map((slot) => slot.startMs));
  const live = existing.filter((slot) => !slot.retired).sort((a, b) => a.startMs - b.startMs);
  const maxEnd: number[] = [];
  live.forEach((slot, index) => maxEnd.push(Math.max(slot.endMs, maxEnd[index - 1] ?? Number.NEGATIVE_INFINITY)));
  return (startMs, endMs) => {
    if (starts.has(startMs)) {
      return true;
    }
    let low = 0;
    let high = live.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((live[mid]?.startMs ?? Infinity) < endMs) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low > 0 && (maxEnd[low - 1] ?? Number.NEGATIVE_INFINITY) > startMs;
  };
}
