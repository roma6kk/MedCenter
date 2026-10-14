import { Inject, Injectable, Logger } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';

import type { DateRange } from '../shared/date-range';

/** Report inputs that only the clinical store (HAPI) knows. */
export interface ClinicalReportSource {
  /** Ids of `Appointment?status=noshow` starting in the period — no domain event exists for a no-show. */
  noShowAppointmentIds(range: DateRange): Promise<ReadonlyArray<string>>;
  /** Current `HealthcareService.name` per id; unknown ids are absent from the map. */
  serviceNames(serviceIds: ReadonlyArray<string>): Promise<ReadonlyMap<string, string>>;
}

export const CLINICAL_REPORT_SOURCE = Symbol('CLINICAL_REPORT_SOURCE');

/** `_count` of one no-show page; HAPI may cap it lower, which only costs an extra page. */
export const NO_SHOW_PAGE_SIZE = 200;

/**
 * Safety valve of the no-show listing: 100 pages (20 000 no-shows in a period of
 * at most 366 days) is far beyond one clinic. Past it the report fails loudly
 * rather than undercount; raise the limit when a deployment really needs it.
 */
export const NO_SHOW_MAX_PAGES = 100;

/**
 * HAPI-backed {@link ClinicalReportSource}. `Appointment`'s `date` search
 * parameter is `Appointment.start`, the same dimension the read-model filters
 * on, so both halves of API §9.1 describe one period. Only ids are fetched
 * (`_elements=id`): the read-model decides which of them it knows.
 */
@Injectable()
export class FhirClinicalReportSource implements ClinicalReportSource {
  private readonly logger = new Logger(FhirClinicalReportSource.name);

  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  /**
   * Pages by `_offset` until a page comes back empty (or `Bundle.total` is
   * reached), not until a page is "short": HAPI may serve fewer than `_count`,
   * so the offset advances by what was actually received.
   */
  async noShowAppointmentIds(range: DateRange): Promise<ReadonlyArray<string>> {
    const ids = new Set<string>();
    let offset = 0;
    for (let page = 0; page < NO_SHOW_MAX_PAGES; page += 1) {
      const result = await this.fhir.search('Appointment', {
        status: 'noshow',
        date: [`ge${range.from.toISOString()}`, `lt${range.toExclusive.toISOString()}`],
        _elements: 'id',
        _sort: '_lastUpdated',
        _count: NO_SHOW_PAGE_SIZE,
        _offset: offset,
      });
      const entries = result.entry ?? [];
      for (const entry of entries) {
        if (typeof entry.resource.id === 'string') {
          ids.add(entry.resource.id);
        }
      }
      offset += entries.length;
      if (entries.length === 0 || (typeof result.total === 'number' && offset >= result.total)) {
        return [...ids];
      }
    }
    throw new Error(`more than ${NO_SHOW_MAX_PAGES * NO_SHOW_PAGE_SIZE} no-show appointments in one period; raise NO_SHOW_MAX_PAGES`);
  }

  /**
   * Names are display sugar: when HAPI cannot answer, the report is still
   * correct without them, so the failure is logged and the ids are shown bare.
   */
  async serviceNames(serviceIds: ReadonlyArray<string>): Promise<ReadonlyMap<string, string>> {
    if (serviceIds.length === 0) {
      return new Map();
    }
    try {
      const result = await this.fhir.search('HealthcareService', {
        _id: serviceIds.join(','),
        _elements: 'name',
        _count: serviceIds.length,
      });
      return new Map(
        (result.entry ?? []).flatMap((entry) => {
          const { id, name } = entry.resource;
          return typeof id === 'string' && typeof name === 'string' ? [[id, name] as const] : [];
        }),
      );
    } catch (error) {
      this.logger.warn({ err: error, serviceIds }, 'HealthcareService names unavailable; reporting bare ids');
      return new Map();
    }
  }
}
