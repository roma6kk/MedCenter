import { Inject, Injectable } from '@nestjs/common';
import type { PaginatedResponseDto } from '@medcenter/contracts';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { resourcesOfType, totalOf } from '../../common/fhir/fhir-search';
import { pageOffset, toPage, type PageQuery, type SortOrder } from '../../common/paging/page-query.dto';
import { viewsOf } from '../encounters/mappers/clinical-view.mapper';
import type { PrescriptionItemDto } from './dto/prescription-item.dto';
import { toMedicationPrescription, toServicePrescription } from './mappers/prescription-item.mapper';

interface Slice {
  readonly resources: readonly FhirResource[];
  readonly total: number;
}

type SearchScope = { readonly patient: string; readonly encounter?: string };

function scopeOf(patientRef: string, encounterId: string | undefined): SearchScope {
  return encounterId === undefined ? { patient: patientRef } : { patient: patientRef, encounter: `Encounter/${encounterId}` };
}

function sortBy(field: string, order: SortOrder): string {
  return order === 'asc' ? field : `-${field}`;
}

/**
 * API §7.5/7.7 — the patient's prescriptions: `MedicationRequest`s first, then
 * `ServiceRequest`s, each by authoring date. HAPI cannot search two resource
 * types in one request, so the listing is the concatenation of the two typed
 * searches and a page is cut from it with exact offsets: the medication search
 * reports its total, and the service-request search continues where the
 * medications end. Two FHIR calls per page, never an unbounded scan.
 */
@Injectable()
export class PrescriptionsService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  /**
   * `encounterId` narrows both searches to one visit; the `patient` constraint
   * stays, so another patient's encounter id yields an empty page, never a read.
   */
  async prescriptionsOf(
    patientRef: string,
    query: PageQuery,
    encounterId?: string,
  ): Promise<PaginatedResponseDto<PrescriptionItemDto>> {
    const offset = pageOffset(query);
    const scope = scopeOf(patientRef, encounterId);
    const medications = await this.slice('MedicationRequest', 'authoredon', scope, query, offset, query.pageSize);
    const remaining = query.pageSize - medications.resources.length;
    const services =
      remaining > 0
        ? await this.slice('ServiceRequest', 'authored', scope, query, Math.max(offset - medications.total, 0), remaining)
        : await this.count('ServiceRequest', scope);
    const items: PrescriptionItemDto[] = [
      ...viewsOf(medications.resources, toMedicationPrescription),
      ...viewsOf(services.resources, toServicePrescription),
    ];
    return toPage(items, medications.total + services.total, query);
  }

  private async slice(
    resourceType: string,
    sortField: string,
    scope: SearchScope,
    query: PageQuery,
    offset: number,
    count: number,
  ): Promise<Slice> {
    const result = await this.fhir.search(resourceType, {
      ...scope,
      _sort: sortBy(sortField, query.sortOrder),
      _count: count,
      _offset: offset,
      _total: 'accurate',
    });
    const resources = resourcesOfType(result, resourceType).slice(0, count);
    // Without a reported total the type is known to extend at least to this slice.
    return { resources, total: totalOf(result) ?? offset + resources.length };
  }

  private async count(resourceType: string, scope: SearchScope): Promise<Slice> {
    const result = await this.fhir.search(resourceType, { ...scope, _summary: 'count' });
    return { resources: [], total: totalOf(result) ?? 0 };
  }
}
