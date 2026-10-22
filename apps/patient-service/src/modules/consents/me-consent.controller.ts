import { Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  claimsOf,
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

/**
 * API §3.4 and §3.6 — the consent of the patient the token belongs to. No path
 * or query parameter names a patient: the compartment comes from the token only (ADR-013).
 */
@Controller('api/v1/me/consent')
export class MeConsentController {
  constructor(private readonly consents: ConsentsService) {}

  @Get()
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_READ)
  async getMine(@Req() request: RequestWithClaims): Promise<PatientConsentResponse> {
    return this.consents.getMine(claimsOf(request));
  }

  /** Blocks new entries at once; nothing is deleted. */
  @Post('revoke')
  @HttpCode(HttpStatus.OK)
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_WRITE)
  async revoke(
    @Req() request: RequestWithClaims & Pick<RequestWithRequestId, 'requestId'>,
  ): Promise<ConsentResponse> {
    return this.consents.revokeMine(claimsOf(request), request.requestId);
  }
}
