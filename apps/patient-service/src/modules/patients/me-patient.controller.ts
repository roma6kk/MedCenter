import { Controller, Get, Req } from '@nestjs/common';
import { claimsOf, RequiresRoles, RequiresScopes, type RequestWithClaims } from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';

import type { PatientResponseDto } from './dto/patient-response.dto';
import { PatientsService } from './patients.service';

/** API §3.1 — the FHIR profile of the patient the token belongs to (FR-001). */
@Controller('api/v1/me/patient')
export class MePatientController {
  constructor(private readonly patients: PatientsService) {}

  /** No query parameter is read: the patient comes from the token only (ADR-013). */
  @Get()
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_READ)
  async getMe(@Req() request: RequestWithClaims): Promise<PatientResponseDto> {
    return this.patients.getMePatient(claimsOf(request));
  }
}
