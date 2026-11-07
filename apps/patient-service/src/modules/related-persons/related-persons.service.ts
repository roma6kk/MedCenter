import { Inject, Injectable, Logger } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { buildPaginatedResponse, type PaginatedResponseDto } from '@medcenter/contracts';
import { FHIR_CLIENT, PatientReadAudit, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { readPatient } from '../../shared/read-patient';
import { PatientAccessService } from '../access/patient-access.service';
import type { RelatedPersonResponseDto } from './dto/related-person-response.dto';
import { relatedPatientIdOf, toRelatedPersonResponseDto } from './mappers/related-person.mapper';

const AUDIT_SOURCE = 'patient-service';

interface RelatedPersonsPage {
  readonly page: number;
  readonly pageSize: number;
}

@Injectable()
export class RelatedPersonsService {
  private readonly logger = new Logger(RelatedPersonsService.name);

  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    private readonly access: PatientAccessService,
    private readonly readAudit: PatientReadAudit,
  ) {}

  async listForPatient(
    patientId: string,
    claims: JwtClaims,
    paging: RelatedPersonsPage,
    requestId?: string,
  ): Promise<PaginatedResponseDto<RelatedPersonResponseDto>> {
    return this.readAudit.audited(claims, patientId, { interaction: 'search-type', source: AUDIT_SOURCE, requestId }, () =>
      this.readList(patientId, claims, paging),
    );
  }

  private async readList(
    patientId: string,
    claims: JwtClaims,
    paging: RelatedPersonsPage,
  ): Promise<PaginatedResponseDto<RelatedPersonResponseDto>> {
    await this.access.assertCanRead(claims, patientId);
    await readPatient(this.fhir, patientId);

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

  // Defence in depth: an entry for any other patient is dropped (and logged), never disclosed.
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

function totalItemsOf(total: number | undefined, paging: RelatedPersonsPage, kept: number, dropped: number): number {
  if (total === undefined) {
    return (paging.page - 1) * paging.pageSize + kept;
  }
  return Math.max(total - dropped, 0);
}
