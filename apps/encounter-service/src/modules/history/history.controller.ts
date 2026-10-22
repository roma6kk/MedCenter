import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { claimsOf, RequiresRoles, RequiresScopes, type RequestWithClaims, type RequestWithRequestId } from '@medcenter/common';
import { Role, SMART_SCOPES, type PaginatedResponseDto } from '@medcenter/contracts';
import { PatientReadAudit } from '@medcenter/fhir';

import { patientRefFromClaims } from '../../common/access/claims-identity';
import { FhirIdPipe } from '../../common/access/fhir-id.pipe';
import { assertReadScope } from '../../common/access/scope-policy';
import { PageQueryDto, toPageQuery } from '../../common/paging/page-query.dto';
import type { HistoryItemDto } from './dto/history-item.dto';
import type { PrescriptionItemDto } from './dto/prescription-item.dto';
import { HistoryService } from './history.service';
import { PatientAccessService } from './patient-access.service';
import { PrescriptionsService } from './prescriptions.service';

const AUDIT_SOURCE = 'encounter-service';

/** An authenticated request after `RequestIdMiddleware` has assigned its correlation id. */
type AuditedRequest = RequestWithClaims & Pick<RequestWithRequestId, 'requestId'>;

/**
 * API §7.4–7.7 — history and prescriptions (FR-007, FR-012…FR-014). The `/me`
 * routes take the patient from the token only; the `/patients/{id}` routes
 * check the caller against that patient first (ADR-013). A `patient` query
 * parameter is never read: `PageQueryDto` does not declare it, so the
 * validation pipe strips it. A doctor's read of `/patients/{id}/…` and any refused
 * read leave an `AuditEvent` (ADR-018, D-3).
 */
@Controller('api/v1')
export class HistoryController {
  constructor(
    private readonly access: PatientAccessService,
    private readonly history: HistoryService,
    private readonly prescriptions: PrescriptionsService,
    private readonly readAudit: PatientReadAudit,
  ) {}

  /** 7.4 — owner patient (`patient/*.read`) or treating doctor (`user/*.read`); not an admin (ADR-018). */
  @Get('patients/:id/history')
  @RequiresRoles(Role.PATIENT, Role.DOCTOR)
  async patientHistory(
    @Req() request: AuditedRequest,
    @Param('id', FhirIdPipe) id: string,
    @Query() query: PageQueryDto,
  ): Promise<PaginatedResponseDto<HistoryItemDto>> {
    const claims = claimsOf(request);
    assertReadScope(claims);
    return this.readAudit.audited(claims, id, { interaction: 'search-type', source: AUDIT_SOURCE, requestId: request.requestId }, async () =>
      this.history.historyOf(await this.access.resolveReadablePatient(claims, id), toPageQuery(query)),
    );
  }

  /** 7.5 — same access as 7.4. */
  @Get('patients/:id/prescriptions')
  @RequiresRoles(Role.PATIENT, Role.DOCTOR)
  async patientPrescriptions(
    @Req() request: AuditedRequest,
    @Param('id', FhirIdPipe) id: string,
    @Query() query: PageQueryDto,
  ): Promise<PaginatedResponseDto<PrescriptionItemDto>> {
    const claims = claimsOf(request);
    assertReadScope(claims);
    return this.readAudit.audited(claims, id, { interaction: 'search-type', source: AUDIT_SOURCE, requestId: request.requestId }, async () =>
      this.prescriptions.prescriptionsOf(await this.access.resolveReadablePatient(claims, id), toPageQuery(query)),
    );
  }

  /** 7.6 — the caller's own history (patient compartment). */
  @Get('me/history')
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_READ)
  async myHistory(@Req() request: RequestWithClaims, @Query() query: PageQueryDto): Promise<PaginatedResponseDto<HistoryItemDto>> {
    return this.history.historyOf(patientRefFromClaims(claimsOf(request)), toPageQuery(query));
  }

  /** 7.7 — the caller's own prescriptions (patient compartment). */
  @Get('me/prescriptions')
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_READ)
  async myPrescriptions(
    @Req() request: RequestWithClaims,
    @Query() query: PageQueryDto,
  ): Promise<PaginatedResponseDto<PrescriptionItemDto>> {
    return this.prescriptions.prescriptionsOf(patientRefFromClaims(claimsOf(request)), toPageQuery(query));
  }
}
