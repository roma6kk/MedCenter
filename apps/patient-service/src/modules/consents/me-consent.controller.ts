import { Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ApiProblems,
  claimsOf,
  GUARD_PROBLEM_STATUSES,
  RequiresRoles,
  RequiresScopes,
  type RequestWithClaims,
  type RequestWithRequestId,
} from '@medcenter/common';
import {
  Role,
  SMART_SCOPES,
  type ConsentResponse,
  type PatientConsentResponse,
} from '@medcenter/contracts';

import { ConsentsService } from './consents.service';
import { ConsentResponseDoc, PatientConsentResponseDoc } from './dto/consent-response.doc';

/**
 * API §3.4 and §3.6 — the consent of the patient the token belongs to. No path
 * or query parameter names a patient: the compartment comes from the token only (ADR-013).
 */
@ApiTags('patient')
@ApiBearerAuth()
@Controller('api/v1/me/consent')
export class MeConsentController {
  constructor(private readonly consents: ConsentsService) {}

  @Get()
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_READ)
  @ApiOperation({ summary: '3.4 Get my consent to the electronic record and its history' })
  @ApiResponse({ status: HttpStatus.OK, type: PatientConsentResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 404], { 404: 'NOT_FOUND: the token has no linked Patient' })
  async getMine(@Req() request: RequestWithClaims): Promise<PatientConsentResponse> {
    return this.consents.getMine(claimsOf(request));
  }

  /** Blocks new entries at once; nothing is deleted. */
  @Post('revoke')
  @HttpCode(HttpStatus.OK)
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_WRITE)
  @ApiOperation({ summary: '3.6 Revoke my consent' })
  @ApiResponse({ status: HttpStatus.OK, type: ConsentResponseDoc, description: 'Consent with status inactive' })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 404, 409], {
    404: 'NOT_FOUND: no active consent to revoke',
    409: 'CONFLICT: the consent was changed concurrently',
  })
  async revoke(
    @Req() request: RequestWithClaims & Pick<RequestWithRequestId, 'requestId'>,
  ): Promise<ConsentResponse> {
    return this.consents.revokeMine(claimsOf(request), request.requestId);
  }
}
