import { createHash } from 'node:crypto';

import { BadGatewayException, BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { MEDCENTER_EXT } from '@medcenter/terminology';

import { clinicDaysBetween, clinicDayEndMs, clinicDayStartMs } from '../../common/clinic-calendar';
import { searchPages } from '../../common/fhir-search';
import { CACHE_KEYS, RedisCacheService } from '../cache/redis-cache.service';
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
 * `generate` never duplicates slots (the M2 gate).
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
   */
  async generate(scheduleId: string, dto: GenerateSlotsDto): Promise<GenerateSlotsResult> {
    this.assertWithinHorizon(dto);

    const schedule = await this.fhirClient.read('Schedule', scheduleId);
    const fromMs = Date.parse(dto.from);
    const toMs = Date.parse(dto.to);
    const planned = planSlots(
      fromMs,
      toMs,
      this.readWindows(scheduleId, schedule),
      this.readSlotDuration(schedule),
    );

    const existing = await this.findExistingStarts(scheduleId, fromMs, toMs);
    this.warnOnUnplannedSlots(scheduleId, planned, existing);
    const fresh = planned
      .filter((slot) => !existing.has(Date.parse(slot.start)))
      .map((slot) => this.toSlotResource(scheduleId, schedule, slot));
    const { generated, failures } = await writeSlotBatches(this.fhirClient, fresh);
    if (generated > 0) {
      // New free slots must show up in the 15 s slot caches (API §5.2.6/5.2.8).
      await this.cache.invalidate([CACHE_KEYS.SCHEDULE_SLOTS(scheduleId), CACHE_KEYS.ALL_DOCTOR_SLOTS]);
    }
    if (failures.length > 0) {
      throw this.partialFailure(scheduleId, generated, failures);
    }

    return { generated, skipped: planned.length - generated };
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
   * Generate still adds the planned slots next to them, so a day can end up with
   * two sets of slots; the line makes that visible before an admin finds out.
   */
  private warnOnUnplannedSlots(scheduleId: string, planned: readonly PlannedSlot[], existing: ReadonlySet<number>): void {
    const plannedStarts = new Set(planned.map((slot) => Date.parse(slot.start)));
    const unplanned = [...existing].filter((start) => !plannedStarts.has(start)).length;
    if (unplanned > 0) {
      this.logger.warn(
        { scheduleId, unplanned, existing: existing.size },
        'Schedule has slots its weekly windows do not plan (windows edited, or slots made when windows were read as UTC); generate adds the planned slots next to them',
      );
    }
  }

  /**
   * Starts (epoch ms) of every slot the schedule already has on the clinic days
   * the range touches — the same days `planSlots` expands, whatever the status
   * (a booked slot is "existing" too and is never overwritten).
   */
  private async findExistingStarts(scheduleId: string, fromMs: number, toMs: number): Promise<Set<number>> {
    const days = clinicDaysBetween(fromMs, toMs);
    const first = days[0];
    const last = days[days.length - 1];
    if (first === undefined || last === undefined) {
      return new Set();
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
    const starts = existing.map((slot) => Date.parse(String(slot['start'])));
    return new Set(starts.filter((start) => Number.isFinite(start)));
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
