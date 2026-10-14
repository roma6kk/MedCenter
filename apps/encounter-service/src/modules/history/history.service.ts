import { Inject, Injectable } from '@nestjs/common';
import type { PaginatedResponseDto } from '@medcenter/contracts';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';

import { resourcesOf, resourcesOfType, totalOf } from '../../common/fhir/fhir-search';
import { pageOffset, toPage, type PageQuery } from '../../common/paging/page-query.dto';
import type { HistoryItemDto } from './dto/history-item.dto';
import { toHistoryItem } from './mappers/history-item.mapper';

/** Diagnoses, summary and recommendations of the page's encounters, in the same Bundle. */
const HISTORY_REVINCLUDES: readonly string[] = ['Condition:encounter', 'ClinicalImpression:encounter', 'CarePlan:encounter'];

/**
 * API §7.4/7.6 — the patient's visit history: finished encounters, ordered by
 * `Encounter.period` (`date`), each with its diagnoses (BR-004), summary and
 * recommendations. The caller resolves `patientRef` (token compartment or an
 * access check) before this service is reached.
 */
@Injectable()
export class HistoryService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  async historyOf(patientRef: string, query: PageQuery): Promise<PaginatedResponseDto<HistoryItemDto>> {
    const result = await this.fhir.search('Encounter', {
      patient: patientRef,
      status: 'finished',
      _sort: query.sortOrder === 'asc' ? 'date' : '-date',
      _count: query.pageSize,
      _offset: pageOffset(query),
      _total: 'accurate',
      _revinclude: HISTORY_REVINCLUDES,
    });
    const related = resourcesOf(result);
    const items = resourcesOfType(result, 'Encounter').map((encounter) => toHistoryItem(encounter, related));
    return toPage(items, totalOf(result), query);
  }
}
