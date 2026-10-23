import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblems, claimsOf, GUARD_PROBLEM_STATUSES, RequiresRoles, RequiresScopes, type RequestWithClaims, type RequestWithRequestId } from '@medcenter/common';
import { Role, SMART_SCOPES, type PaginatedResponseDto } from '@medcenter/contracts';
import { PatientReadAudit } from '@medcenter/fhir';

import { patientRefFromClaims } from '../../common/access/claims-identity';
import { FhirIdPipe } from '../../common/access/fhir-id.pipe';
import { assertReadScope } from '../../common/access/scope-policy';
import { PageQueryDto, toPageQuery } from '../../common/paging/page-query.dto';
import { HistoryPageDoc } from './dto/history-item.doc';
import type { HistoryItemDto } from './dto/history-item.dto';
import { MedicationPrescriptionDoc, PrescriptionPageDoc, ServicePrescriptionDoc } from './dto/prescription-item.doc';
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
@ApiTags('encounter')
@ApiBearerAuth()
@ApiExtraModels(MedicationPrescriptionDoc, ServicePrescriptionDoc)
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
  @ApiOperation({ summary: '7.4 Patient history of encounters' })
  @ApiParam({ name: 'id', description: 'Patient id (FHIR id)' })
  @ApiResponse({ status: 200, description: 'Page of finished encounters, newest first by default', type: HistoryPageDoc })
  @ApiProblems([400, ...GUARD_PROBLEM_STATUSES, 404], {
    403: 'COMPARTMENT_VIOLATION: not the owner or a treating doctor; FORBIDDEN_ROLE: administrators have no access (ADR-018)',
    404: 'NOT_FOUND: patient not found',
  })
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
  @ApiOperation({ summary: '7.5 Patient prescriptions' })
  @ApiParam({ name: 'id', description: 'Patient id (FHIR id)' })
  @ApiResponse({ status: 200, description: 'Page of MedicationRequest / ServiceRequest items (discriminated by kind)', type: PrescriptionPageDoc })
  @ApiProblems([400, ...GUARD_PROBLEM_STATUSES, 404], {
    403: 'COMPARTMENT_VIOLATION: not the owner or a treating doctor; FORBIDDEN_ROLE: administrators have no access (ADR-018)',
    404: 'NOT_FOUND: patient not found',
  })
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
  @ApiOperation({ summary: '7.6 My history of encounters' })
  @ApiResponse({ status: 200, description: 'Page of the caller\'s finished encounters', type: HistoryPageDoc })
  @ApiProblems([400, ...GUARD_PROBLEM_STATUSES])
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_READ)
  async myHistory(@Req() request: RequestWithClaims, @Query() query: PageQueryDto): Promise<PaginatedResponseDto<HistoryItemDto>> {
    return this.history.historyOf(patientRefFromClaims(claimsOf(request)), toPageQuery(query));
  }

  /** 7.7 — the caller's own prescriptions (patient compartment). */
  @Get('me/prescriptions')
  @ApiOperation({ summary: '7.7 My prescriptions' })
  @ApiResponse({ status: 200, description: 'Page of the caller\'s prescriptions', type: PrescriptionPageDoc })
  @ApiProblems([400, ...GUARD_PROBLEM_STATUSES])
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_READ)
  async myPrescriptions(
    @Req() request: RequestWithClaims,
    @Query() query: PageQueryDto,
  ): Promise<PaginatedResponseDto<PrescriptionItemDto>> {
    return this.prescriptions.prescriptionsOf(patientRefFromClaims(claimsOf(request)), toPageQuery(query));
  }
}
