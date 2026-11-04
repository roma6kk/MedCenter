import { createHash } from 'node:crypto';

import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { clinicDateOf, clinicDayEndMs, clinicDaysBetween, clinicDayStartMs } from '@medcenter/common';
import { buildWriteAuditEvent, commitTransaction, FHIR_CLIENT, type FhirClient, type FhirResource, type WriteActor } from '@medcenter/fhir';
import { MEDCENTER_EXT } from '@medcenter/terminology';

import { searchPages } from '../../common/fhir-search';
import { CACHE_KEYS, RedisCacheService } from '../cache/redis-cache.service';
import { toScheduleSummaryDto } from '../slots/schedule-summary.mapper';
import { GenerateSlotsDto } from './dto/generate-slots.dto';
import type { WeeklyWindowDto } from './dto/create-schedule.dto';
import { PLANNING_HORIZON_DAYS, SLOT_DURATION_EXT, WEEKLY_WINDOWS_EXT } from './schedule.constants';
import { writeSlotBatches } from './slot-batch-writer';
import { planSlots, type PlannedSlot } from './slot-planner';

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Pages read to find the slots a range already has: 150 x 200 = 30 000 covers the
 * longest permitted run (91 clinic days, both ends of a 90-day range, of 288
 * five-minute slots = 26 208 for one schedule). A
 * cut-off list would let a re-run overwrite a booked slot with a fresh `free`
 * one, so a search that still hits the cap fails the run instead (`findExistingStarts`).
 */
export const EXISTING_SLOT_MAX_PAGES = 150;

/** `AuditEvent.source` of the generation event. */
const AUDIT_SOURCE = 'catalog-service';

/** A slot the schedule already has: the instants it covers, and whether a removal retired it. */
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

interface ScheduleHorizon {
  readonly extension?: ReadonlyArray<{ readonly url?: string; readonly valueString?: string }>;
}

/**
 * Expands `Schedule.planningHorizon` weekly windows into R4 `Slot` resources.
 *
 * ADR-015: our HAPI is the single source of schedule truth. Generation is
 * **idempotent** — a slot whose id already exists is skipped, so re-running
 * `generate` never duplicates slots (the M2 gate); a slot that would overlap
 * one the schedule already has is skipped too.
 */
@Injectable()
export class SlotGeneratorService {
  private readonly logger = new Logger(SlotGeneratorService.name);

  constructor(
    @Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient,
    private readonly cache: RedisCacheService,
  ) {}

  /**
   * Idempotency contract (API §5.2.5, ADR-015): a slot is identified by the
   * deterministic (schedule, start) digest, so re-running the same range — or
   * extending it into new days — never duplicates: every planned slot whose
   * `start` already exists on this schedule is skipped individually (per-slot,
   * not per-day/per-range), and only genuinely new slots are written. The id is
   * a pure function of (scheduleId, start), so equal starts imply equal ids.
   * A planned slot that overlaps a slot the schedule already has (windows or the
   * duration were edited after the first run, or the slots come from the older
   * generator that read windows as UTC) is skipped as well, so a doctor and a
   * room never get two bookable slots for the same time (BR-001, BR-007).
   * The run is journalled with one `AuditEvent` (FR-021).
   */
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
      // New free slots must show up in the 15 s slot caches (API §5.2.6/5.2.8).
      await this.cache.invalidate([CACHE_KEYS.SCHEDULE_SLOTS(scheduleId), CACHE_KEYS.ALL_DOCTOR_SLOTS]);
      await this.auditGeneration(scheduleId, dto, actor, generated, planned.length - generated);
    }
    if (failures.length > 0) {
      throw this.partialFailure(scheduleId, generated, failures);
    }

    return { generated, skipped: planned.length - generated };
  }

  /**
   * One journal entry per run that wrote slots (FR-021): who opened the booking for which dates.
   * The slots themselves are a by-product of the schedule and are not journalled one by one.
   * A failure to write the event is logged, not thrown: the slots are already bookable and a
   * retry would only skip them, so the admin must still get the result.
   */
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

  /**
   * A batch is not atomic, so some slots can be written while others are not.
   * That is not "skipped": the admin must see the failure. Generation is
   * idempotent, so running the same range again writes only what is missing.
   */
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

  /**
   * Slots the schedule already has on the range's days that its current windows
   * do not plan: windows edited after the first run, or slots from the older
   * generator that read a window as UTC (`09:00` became 09:00Z, not 06:00Z).
   * A planned slot that overlaps one of them is not written (`overlapSkipped`);
   * the line makes that visible before an admin finds out.
   */
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

  /**
   * Every slot the schedule already has on the clinic days the range touches — the
   * same days `planSlots` expands, whatever the status (a booked slot is "existing"
   * too and is never overwritten).
   */
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
        // A slot stored without an end still blocks its own start.
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

  /** A schedule that was removed but kept for the appointment history (`active=false`) takes no new slots. */
  private assertActive(scheduleId: string, schedule: FhirResource): void {
    if (schedule['active'] === false) {
      throw new ConflictException({
        errorCode: 'CONFLICT',
        message: `CONFLICT: schedule ${scheduleId} is deactivated (removed); create a new schedule to generate slots`,
      });
    }
  }

  /**
   * API §5.2.5, ADR-015: slots are generated inside the schedule's own planning horizon. The
   * overlap check of two schedules compares horizons, so slots outside it would sit on top of
   * another schedule's. A missing bound stays open (schedules written without a horizon).
   */
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

  /**
   * Deterministic slot id: same schedule + same start -> same id (idempotency).
   *
   * A raw concatenation (`sched-9-2026-11-02T09:00:00.000Z`) is not a valid FHIR
   * id — the `:` characters violate `[A-Za-z0-9\-.]{1,64}` and HAPI rejects
   * every create. A SHA-256 digest truncated to 64 chars stays within the
   * pattern and stays collision-free for practical purposes.
   */
  private slotId(scheduleId: string, start: string): string {
    return createHash('sha256').update(`${scheduleId}|${start}`).digest('hex').slice(0, 64);
  }

  private readWindows(scheduleId: string, schedule: FhirResource): WeeklyWindowDto[] {
    const horizon = (schedule as ScheduleHorizon).extension?.find(
      (ext) => ext.url === WEEKLY_WINDOWS_EXT,
    );
    if (horizon?.valueString === undefined) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(horizon.valueString);
      return Array.isArray(parsed) ? (parsed as WeeklyWindowDto[]) : [];
    } catch (error: unknown) {
      // Not silent: an unreadable value makes `generate` answer "0 generated".
      this.logger.warn(
        { scheduleId, err: error instanceof Error ? error.message : String(error) },
        'Weekly windows of the schedule are not valid JSON; nothing to generate',
      );
      return [];
    }
  }

  /** Reads the slot duration from the valueInteger extension (a strict HAPI
   *  rejects `slotDurationMin` as a top-level element — see schedules.service).
   *  Falls back to 30 min when the schedule predates the extension. */
  private readSlotDuration(schedule: FhirResource): number {
    const extensions = schedule['extension'];
    if (Array.isArray(extensions)) {
      const ext = (extensions as Array<Record<string, unknown>>).find(
        (candidate) => candidate['url'] === SLOT_DURATION_EXT,
      );
      if (typeof ext?.['valueInteger'] === 'number') {
        return ext['valueInteger'] as number;
      }
    }
    // Legacy fallback: field written by older versions before the extension.
    const value = schedule['slotDurationMin'];
    return typeof value === 'number' ? value : 30;
  }
}

/** Clinic calendar day of a date or date-time bound. */
function clinicDayOf(bound: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(bound) ? bound : clinicDateOf(Date.parse(bound));
}

/**
 * Tells whether a planned `[start, end)` collides with a slot the schedule has: the same start
 * (a slot of any status, even a retired one, so its id is never rewritten) or an overlap with
 * a live one. Existing slots are sorted by start with a running maximum of their ends, so one
 * binary search answers per planned slot.
 */
function overlapFilter(existing: readonly ExistingSlot[]): (startMs: number, endMs: number) => boolean {
  const starts = new Set(existing.map((slot) => slot.startMs));
  const live = existing.filter((slot) => !slot.retired).sort((a, b) => a.startMs - b.startMs);
  const maxEnd: number[] = [];
  live.forEach((slot, index) => maxEnd.push(Math.max(slot.endMs, maxEnd[index - 1] ?? Number.NEGATIVE_INFINITY)));
  return (startMs, endMs) => {
    if (starts.has(startMs)) {
      return true;
    }
    // Slots starting before this one ends: the last of them is `low - 1`.
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
