import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { buildPaginatedResponse, type PaginatedResponseDto } from '@medcenter/contracts';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { PatientAccessService } from '../access/patient-access.service';
import type { RelatedPersonResponseDto } from './dto/related-person-response.dto';
import { relatedPatientIdOf, toRelatedPersonResponseDto } from './mappers/related-person.mapper';

export interface RelatedPersonsPage {
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Trusted persons of a patient (API §3.3) — `RelatedPerson` resources whose
 * `patient` is the requested Patient. Same access rules as the card itself
 * (`PatientAccessService`); read-only, so no `AuditEvent` (ADR-014).
 */
@Injectable()
export class RelatedPersonsService {
  private readonly logger = new Logger(RelatedPersonsService.name);

  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    private readonly access: PatientAccessService,
  ) {}

  async listForPatient(
    patientId: string,
    claims: JwtClaims,
    paging: RelatedPersonsPage,
  ): Promise<PaginatedResponseDto<RelatedPersonResponseDto>> {
    await this.access.assertCanRead(claims, patientId);
    await this.assertPatientExists(patientId);

    const result = await this.fhir.search('RelatedPerson', {
      patient: `Patient/${patientId}`,
      _count: paging.pageSize,
      _offset: (paging.page - 1) * paging.pageSize,
      _total: 'accurate',
      _sort: '_id',
    });
    // Non-RelatedPerson entries (e.g. an `OperationOutcome` with `search.mode=outcome`) are not matches.
    const relatedPersons = (result.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource) => resource.resourceType === 'RelatedPerson');
    const owned = this.ownedBy(patientId, relatedPersons);
    const totalItems = totalItemsOf(result.total, paging, owned.length, relatedPersons.length - owned.length);
    return buildPaginatedResponse(owned.map(toRelatedPersonResponseDto), {
      page: paging.page,
      pageSize: paging.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / paging.pageSize),
    });
  }

  /** Unknown id → `404 NOT_FOUND` (HAPI 404/410 via `FhirClientError`), checked after the compartment. */
  private async assertPatientExists(patientId: string): Promise<void> {
    const patient = await this.fhir.read('Patient', patientId);
    if (patient.resourceType !== 'Patient') {
      throw new NotFoundException({ errorCode: 'NOT_FOUND', message: `NOT_FOUND: Patient ${patientId} does not exist` });
    }
  }

  /**
   * Defence in depth: HAPI must only return this patient's RelatedPersons, but
   * an entry for anyone else is dropped (and logged) rather than disclosed.
   */
  private ownedBy(patientId: string, relatedPersons: ReadonlyArray<FhirResource>): ReadonlyArray<FhirResource> {
    return relatedPersons.filter((resource) => {
      const isOwned = relatedPatientIdOf(resource) === patientId;
      if (!isOwned) {
        this.logger.error({ patientId, resourceId: resource.id }, 'RelatedPerson search returned a foreign entry');
      }
      return isOwned;
    });
  }
}

/**
 * `meta.totalItems` (API §0). `Bundle.total` counts every match HAPI found, so
 * foreign entries dropped by `ownedBy` are taken off it — `meta` never
 * promises items the client is not allowed to see.
 */
function totalItemsOf(total: number | undefined, paging: RelatedPersonsPage, kept: number, dropped: number): number {
  if (total === undefined) {
    return (paging.page - 1) * paging.pageSize + kept;
  }
  return Math.max(total - dropped, 0);
}
