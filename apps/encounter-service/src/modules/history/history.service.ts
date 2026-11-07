import { Inject, Injectable } from '@nestjs/common';
import type { PaginatedResponseDto } from '@medcenter/contracts';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';
import { DEFAULT_CONTENT_LANGUAGE, type ContentLanguage } from '@medcenter/fhir-mappers';

import { resourcesOf, resourcesOfType, totalOf } from '../../common/fhir/fhir-search';
import { pageOffset, toPage, type PageQuery } from '../../common/paging/page-query.dto';
import type { HistoryItemDto } from './dto/history-item.dto';
import { toHistoryItem } from './mappers/history-item.mapper';

const HISTORY_REVINCLUDES: readonly string[] = ['Condition:encounter', 'ClinicalImpression:encounter', 'CarePlan:encounter'];

const HISTORY_DOCTOR_INCLUDES: Readonly<Record<string, string>> = {
  _include: 'Encounter:participant',
  '_include:iterate': 'PractitionerRole:practitioner',
};

@Injectable()
export class HistoryService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  async historyOf(
    patientRef: string,
    query: PageQuery,
    lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE,
  ): Promise<PaginatedResponseDto<HistoryItemDto>> {
    const result = await this.fhir.search('Encounter', {
      patient: patientRef,
      status: 'finished',
      _sort: query.sortOrder === 'asc' ? 'date' : '-date',
      _count: query.pageSize,
      _offset: pageOffset(query),
      _total: 'accurate',
      _revinclude: HISTORY_REVINCLUDES,
      ...HISTORY_DOCTOR_INCLUDES,
    });
    const related = resourcesOf(result);
    const items = resourcesOfType(result, 'Encounter').map((encounter) => toHistoryItem(encounter, related, lang));
    return toPage(items, totalOf(result), query);
  }
}
