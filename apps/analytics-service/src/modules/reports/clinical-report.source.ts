import { Inject, Injectable, Logger } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';
import { DEFAULT_CONTENT_LANGUAGE, translated, type ContentLanguage } from '@medcenter/fhir-mappers';

import type { DateRange } from '../shared/date-range';

export interface ClinicalReportSource {
  noShowAppointmentIds(range: DateRange): Promise<ReadonlyArray<string>>;
  // encounter.completed.v1 carries no appointmentId, so attended visits are known to HAPI only.
  fulfilledAppointmentIds(range: DateRange): Promise<ReadonlyArray<string>>;
  serviceNames(serviceIds: ReadonlyArray<string>, lang?: ContentLanguage): Promise<ReadonlyMap<string, string>>;
}

export const CLINICAL_REPORT_SOURCE = Symbol('CLINICAL_REPORT_SOURCE');

export const NO_SHOW_PAGE_SIZE = 200;

// Safety valve: past 100 pages the report fails loudly rather than undercount.
export const NO_SHOW_MAX_PAGES = 100;

@Injectable()
export class FhirClinicalReportSource implements ClinicalReportSource {
  private readonly logger = new Logger(FhirClinicalReportSource.name);

  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  noShowAppointmentIds(range: DateRange): Promise<ReadonlyArray<string>> {
    return this.appointmentIdsByStatus('noshow', range);
  }

  fulfilledAppointmentIds(range: DateRange): Promise<ReadonlyArray<string>> {
    return this.appointmentIdsByStatus('fulfilled', range);
  }

  // Pages until an empty page or Bundle.total; HAPI may serve fewer than _count, so the offset advances by what was received.
  private async appointmentIdsByStatus(status: 'noshow' | 'fulfilled', range: DateRange): Promise<ReadonlyArray<string>> {
    const ids = new Set<string>();
    let offset = 0;
    for (let page = 0; page < NO_SHOW_MAX_PAGES; page += 1) {
      const result = await this.fhir.search('Appointment', {
        status,
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
    throw new Error(`more than ${NO_SHOW_MAX_PAGES * NO_SHOW_PAGE_SIZE} ${status === 'noshow' ? 'no-show' : status} appointments in one period; raise NO_SHOW_MAX_PAGES`);
  }

  async serviceNames(
    serviceIds: ReadonlyArray<string>,
    lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE,
  ): Promise<ReadonlyMap<string, string>> {
    if (serviceIds.length === 0) {
      return new Map();
    }
    try {
      const result = await this.fhir.search('HealthcareService', {
        _id: serviceIds.join(','),
        ...(lang === DEFAULT_CONTENT_LANGUAGE ? { _elements: 'name' } : {}),
        _count: serviceIds.length,
      });
      return new Map(
        (result.entry ?? []).flatMap((entry) => {
          const { id, name, _name: nameElement } = entry.resource;
          return typeof id === 'string' && typeof name === 'string' ? [[id, translated(name, nameElement, lang)] as const] : [];
        }),
      );
    } catch (error) {
      this.logger.warn({ err: error, serviceIds }, 'HealthcareService names unavailable; reporting bare ids');
      return new Map();
    }
  }
}
