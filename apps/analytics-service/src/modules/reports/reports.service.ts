import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../shared/clock';
import { resolveDateRange, toInclusivePeriod, type DateRange, type DateRangeInput } from '../shared/date-range';
import { CLINICAL_REPORT_SOURCE, type ClinicalReportSource } from './clinical-report.source';
import type { AppointmentsSummaryDto } from './dto/appointments-summary.dto';
import type { EncountersSummaryDto } from './dto/encounters-summary.dto';
import type { MeasureGroupDto, MeasureReportDto } from './dto/measure-report.dto';
import { DEFAULT_TOP_SERVICES, type ServicesPopularityDto } from './dto/services-popularity.dto';
import { REPORTS_REPOSITORY, type ReportsRepository, type SqlCount, type StatusCountRow } from './reports.repository';

const UNKNOWN_SPECIALTY_DISPLAY = 'Специальность не указана';

function toCount(value: SqlCount): number {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

function countOf(rows: ReadonlyArray<StatusCountRow>, status: string): number {
  return rows.filter((row) => row.status === status).reduce((sum, row) => sum + toCount(row.count), 0);
}

function sumOf(groups: ReadonlyArray<MeasureGroupDto>): number {
  return groups.reduce((sum, group) => sum + group.count, 0);
}

/**
 * API §9.1–9.3 (FR-019). The read-model answers every count it owns; HAPI adds
 * what no event carries: which appointments are no-shows, and current service names.
 */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(REPORTS_REPOSITORY) private readonly repository: ReportsRepository,
    @Inject(CLINICAL_REPORT_SOURCE) private readonly clinical: ClinicalReportSource,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * `booked`, `cancelled` and `noshow` partition the appointments the read-model
   * knows. A no-show is a former `booked` appointment that only HAPI knows
   * about, so HAPI lists the no-show ids and the read-model reclassifies the ones
   * it holds as `booked` — in one statement. An appointment the read-model never
   * heard of (booked before the worker ran) is in none of the three counts.
   */
  async appointmentsSummary(query: DateRangeInput): Promise<AppointmentsSummaryDto> {
    const range = this.rangeOf(query);
    const noShowIds = await this.clinical.noShowAppointmentIds(range);
    const rows = await this.repository.countAppointmentsByStatus(range, noShowIds);
    const booked = countOf(rows, 'booked');
    const cancelled = countOf(rows, 'cancelled');
    const noshow = countOf(rows, 'noshow');
    const groups: ReadonlyArray<MeasureGroupDto> = [
      { code: 'booked', display: 'Записано', count: booked },
      { code: 'cancelled', display: 'Отменено', count: cancelled },
      { code: 'noshow', display: 'Неявка', count: noshow },
    ];
    return { ...this.envelope('appointments-by-status', range, groups), booked, cancelled, noshow };
  }

  async encountersSummary(query: DateRangeInput): Promise<EncountersSummaryDto> {
    const range = this.rangeOf(query);
    const rows = await this.repository.countEncountersBySpecialty(range);
    const groups = rows.map(
      (row): MeasureGroupDto => ({
        code: row.code,
        ...(row.system === null ? {} : { system: row.system }),
        display: row.display ?? UNKNOWN_SPECIALTY_DISPLAY,
        count: toCount(row.count),
      }),
    );
    return this.envelope('encounters-by-specialty', range, groups);
  }

  async servicesPopularity(query: DateRangeInput & { readonly top?: number }): Promise<ServicesPopularityDto> {
    const range = this.rangeOf(query);
    const rows = await this.repository.countBookingsByService(range, query.top ?? DEFAULT_TOP_SERVICES);
    const names = rows.length === 0 ? new Map<string, string>() : await this.clinical.serviceNames(rows.map((row) => row.serviceId));
    const groups = rows.map((row): MeasureGroupDto => {
      const display = names.get(row.serviceId);
      return { code: row.serviceId, ...(display === undefined ? {} : { display }), count: toCount(row.count) };
    });
    return this.envelope('services-popularity', range, groups);
  }

  private rangeOf(query: DateRangeInput): DateRange {
    return resolveDateRange({ from: query.from, to: query.to }, this.clock());
  }

  private envelope<TMeasure extends string>(
    measure: TMeasure,
    range: DateRange,
    groups: ReadonlyArray<MeasureGroupDto>,
  ): MeasureReportDto & { readonly measure: TMeasure } {
    return { measure, scoring: 'cohort', period: toInclusivePeriod(range), total: sumOf(groups), groups };
  }
}
