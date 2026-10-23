import { BadRequestException, Body, Controller, Get, Headers, HttpStatus, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ApiProblems,
  claimsOf,
  GUARD_PROBLEM_STATUSES,
  RequiresRoles,
  RequiresScopes,
  type RequestWithClaims,
  type RequestWithRequestId,
} from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';

import type { PatientResponseDto } from './dto/patient-response.dto';
import { PatientResponseDoc } from './dto/patient-response.doc';
import { UpdateMyPatientDto } from './dto/update-my-patient.dto';
import { versionFromIfMatch } from './if-match';
import { PatientsService } from './patients.service';

/** API §3.1 and §3.12 — the FHIR profile of the patient the token belongs to (FR-001). */
@ApiTags('patient')
@ApiBearerAuth()
@Controller('api/v1/me/patient')
export class MePatientController {
  constructor(private readonly patients: PatientsService) {}

  /** No query parameter is read: the patient comes from the token only (ADR-013). */
  @Get()
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_READ)
  @ApiOperation({ summary: '3.1 Get the FHIR profile of the current patient' })
  @ApiResponse({ status: HttpStatus.OK, type: PatientResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 404], { 404: 'NOT_FOUND: the token has no linked Patient' })
  async getMe(@Req() request: RequestWithClaims): Promise<PatientResponseDto> {
    return this.patients.getMePatient(claimsOf(request));
  }

  /** The phone is the only editable field; ADMIN and DOCTOR have no write path here. */
  @Patch()
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_WRITE)
  @ApiOperation({ summary: '3.12 Change the phone of the current patient' })
  @ApiHeader({ name: 'If-Match', required: true, description: 'Card version (`version` from 3.1, ADR-012)', example: '3' })
  @ApiResponse({ status: HttpStatus.OK, type: PatientResponseDoc, description: 'Card with the new version' })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404, 409], {
    400: 'VALIDATION_ERROR: invalid phone or missing If-Match',
    409: 'CONFLICT: stale If-Match version',
  })
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
