import { createHash } from 'node:crypto';

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { MEDCENTER_EXT } from '@medcenter/terminology';

import { GenerateSlotsDto } from './dto/generate-slots.dto';
import type { WeeklyWindowDto } from './dto/create-schedule.dto';
import { PLANNING_HORIZON_DAYS, SLOT_DURATION_EXT, WEEKLY_WINDOWS_EXT } from './schedule.constants';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_CODE: Readonly<Record<number, string>> = {
  0: 'SU',
  1: 'MO',
  2: 'TU',
  3: 'WE',
  4: 'TH',
  5: 'FR',
  6: 'SA',
};

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
  constructor(@Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient) {}

  async generate(scheduleId: string, dto: GenerateSlotsDto): Promise<GenerateSlotsResult> {
    this.assertWithinHorizon(dto);

    const schedule = await this.fhirClient.read('Schedule', scheduleId);
    const windows = this.readWindows(schedule);
    const slotDurationMin = this.readSlotDuration(schedule);
    const actors = (schedule as ScheduleActors).actor ?? [];

    // Idempotency contract (API §5.2.5, ADR-015): a slot is identified by the
    // deterministic (schedule, start) digest, so re-running the same range —
    // or extending it into new days — never duplicates: every planned slot
    // whose `start` already exists on this schedule is skipped individually
    // (per-slot, not per-day/per-range), and only genuinely new slots are
    // written. Start is the natural identity here: the id is a pure function
    // of (scheduleId, start), so equal starts imply equal ids.
    const existing = await this.fhirClient.search('Slot', {
      schedule: `Schedule/${scheduleId}`,
      start: [`ge${dto.from}`, `le${dto.to}`],
      _count: 1000,
    });
    const existingStarts = new Set(
      (existing.entry ?? [])
        .map((entry) => entry.resource['start'])
        .filter((start): start is string => typeof start === 'string'),
    );

    const starts = this.expandStarts(dto.from, dto.to, windows, slotDurationMin);
    const slots: FhirResource[] = starts.map(({ start, end }) => ({
      resourceType: 'Slot',
      id: this.slotId(scheduleId, start),
      schedule: { reference: `Schedule/${scheduleId}` },
      status: 'free',
      start,
      end,
      ...(actors.length === 0
        ? {}
        : { extension: [{ url: MEDCENTER_EXT.SLOT_ACTORS, valueString: JSON.stringify(actors) }] }),
    }));

    const fresh = slots.filter((slot) => !existingStarts.has(slot['start'] as string));
    const generated = await this.createBatch(fresh);

    return { generated, skipped: slots.length - generated };
  }

  /**
   * Writes new slots in FHIR batch Bundles (one HTTP request per chunk, NFR-005
   * — the previous per-slot loop issued thousands of sequential calls for a
   * 90-day horizon). `type: 'batch'` keeps per-entry outcomes: a failed entry
   * surfaces in `OperationOutcome` without rolling back the rest. Entries are
   * `PUT Slot/{id}` (conditional on the deterministic id), so a concurrent
   * generate with the same id updates instead of duplicating.
   */
  private async createBatch(slots: readonly FhirResource[]): Promise<number> {
    const BATCH_SIZE = 200;
    let generated = 0;
    for (let offset = 0; offset < slots.length; offset += BATCH_SIZE) {
      const chunk = slots.slice(offset, offset + BATCH_SIZE);
      const bundle: FhirResource = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: chunk.map((slot) => ({
          request: { method: 'PUT', url: `Slot/${slot.id}` },
          resource: slot,
        })),
      };
      const response = await this.fhirClient.batch(bundle);
      const responseEntries = response['entry'] as
        | ReadonlyArray<{ readonly response?: { readonly status?: string } }>
        | undefined;
      generated += (responseEntries ?? []).filter(
        (entry) => typeof entry.response?.status === 'string' && entry.response.status.startsWith('2'),
      ).length;
    }
    return generated;
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

  private expandStarts(
    from: string,
    to: string,
    windows: readonly WeeklyWindowDto[],
    slotDurationMin: number,
  ): Array<{ start: string; end: string }> {
    const result: Array<{ start: string; end: string }> = [];
    const startDay = this.floorToUtcDay(from);
    const endDay = this.floorToUtcDay(to);

    for (let cursor = startDay; cursor <= endDay; cursor += DAY_MS) {
      const dayCode = DAY_CODE[new Date(cursor).getUTCDay()];
      for (const window of windows) {
        if (window.dayOfWeek !== dayCode) {
          continue;
        }
        for (const slot of this.splitWindow(cursor, window, slotDurationMin)) {
          result.push(slot);
        }
      }
    }
    return result;
  }

  private splitWindow(
    dayStartMs: number,
    window: WeeklyWindowDto,
    slotDurationMin: number,
  ): Array<{ start: string; end: string }> {
    const startMin = this.toMinutes(window.startTime);
    const endMin = this.toMinutes(window.endTime);
    const slots: Array<{ start: string; end: string }> = [];
    for (let minute = startMin; minute + slotDurationMin <= endMin; minute += slotDurationMin) {
      slots.push({
        start: new Date(dayStartMs + minute * 60_000).toISOString(),
        end: new Date(dayStartMs + (minute + slotDurationMin) * 60_000).toISOString(),
      });
    }
    return slots;
  }

  private toMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private floorToUtcDay(date: string): number {
    return Math.floor(Date.parse(date) / DAY_MS) * DAY_MS;
  }

  /**
   * Deterministic slot id: same schedule + same start -> same id (idempotency).
   *</n   * A raw concatenation (`sched-9-2026-11-02T09:00:00.000Z`) is not a valid FHIR
   * id — the `:` characters violate `[A-Za-z0-9\-.]{1,64}` and HAPI rejects
   * every create. A SHA-256 digest truncated to 64 chars stays within the
   * pattern and stays collision-free for practical purposes.
   */
  private slotId(scheduleId: string, start: string): string {
    return createHash('sha256').update(`${scheduleId}|${start}`).digest('hex').slice(0, 64);
  }

  private readWindows(schedule: FhirResource): WeeklyWindowDto[] {
    const horizon = (schedule as ScheduleHorizon).extension?.find(
      (ext) => ext.url === WEEKLY_WINDOWS_EXT,
    );
    if (horizon?.valueString === undefined) {
      return [];
    }
    try {
      return JSON.parse(horizon.valueString) as WeeklyWindowDto[];
    } catch {
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
