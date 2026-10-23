import { BadRequestException, Body, Controller, Get, Headers, Patch, Req } from '@nestjs/common';
import {
  claimsOf,
  RequiresRoles,
  RequiresScopes,
  type RequestWithClaims,
  type RequestWithRequestId,
} from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';

import type { PatientResponseDto } from './dto/patient-response.dto';
import { UpdateMyPatientDto } from './dto/update-my-patient.dto';
import { versionFromIfMatch } from './if-match';
import { PatientsService } from './patients.service';

/** API §3.1 and §3.12 — the FHIR profile of the patient the token belongs to (FR-001). */
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

  /** The phone is the only editable field; ADMIN and DOCTOR have no write path here. */
  @Patch()
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_WRITE)
  async updateMe(
    @Req() request: RequestWithClaims & Pick<RequestWithRequestId, 'requestId'>,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() dto: UpdateMyPatientDto,
  ): Promise<PatientResponseDto> {
    const version = versionFromIfMatch(ifMatch);
    if (version === null) {
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: 'If-Match: the version of the card being edited is required',
        details: [{ field: 'If-Match', message: 'the version of the card being edited is required' }],
      });
    }
    return this.patients.updateMyPhone(claimsOf(request), version, dto.phone, request.requestId);
  }
}
