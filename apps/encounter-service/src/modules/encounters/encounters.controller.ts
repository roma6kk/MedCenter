import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblems, claimsOf, GUARD_PROBLEM_STATUSES, RequiresRoles, RequiresScopes, type RequestWithClaims, type RequestWithRequestId } from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';
import type { Response } from 'express';

import { FhirIdPipe } from '../../common/access/fhir-id.pipe';
import { CompleteEncounterDto } from './dto/complete-encounter.dto';
import { EncounterDetailsDoc, EncounterResponseDoc } from './dto/encounter-response.doc';
import type { EncounterDetailsDto, EncounterResponseDto } from './dto/encounter-response.dto';
import { OpenEncounterDto } from './dto/open-encounter.dto';
import { EncounterOpeningService } from './encounter-opening.service';
import { EncountersService } from './encounters.service';

/** An authenticated request after `RequestIdMiddleware` has assigned its correlation id. */
type AuditedRequest = RequestWithClaims & Pick<RequestWithRequestId, 'requestId'>;

/**
 * API §7.1–7.3 — the doctor opens and completes an encounter (FR-010…FR-014).
 * The doctor is identified by `fhirUser = PractitionerRole/{id}` and must take
 * part in the appointment / encounter; a token without it fails closed (403).
 */
@ApiTags('encounter')
@ApiBearerAuth()
@Controller('api/v1/encounters')
export class EncountersController {
  constructor(
    private readonly opening: EncounterOpeningService,
    private readonly encounters: EncountersService,
  ) {}

  /** 7.1 — `201` with the new encounter; `200` with the open one when the appointment already has it. */
  @Post()
  @ApiOperation({ summary: '7.1 Open an encounter for a booked appointment' })
  @ApiResponse({ status: 201, description: 'Encounter created (in-progress)', type: EncounterResponseDoc })
  @ApiResponse({ status: 200, description: 'The appointment already has an open encounter', type: EncounterResponseDoc })
  @ApiProblems([400, ...GUARD_PROBLEM_STATUSES, 404, 409], {
    409: 'ENCOUNTER_STATE_INVALID: appointment is not booked; CONSENT_REQUIRED: no active EHR consent (unless emergencyReason is given)',
    403: 'FORBIDDEN_ROLE / FORBIDDEN_SCOPE / COMPARTMENT_VIOLATION: the doctor is not the appointment participant',
    404: 'NOT_FOUND: appointment not found',
  })
  @RequiresRoles(Role.DOCTOR)
  @RequiresScopes(SMART_SCOPES.USER_WRITE)
  async open(
    @Req() request: AuditedRequest,
    @Body() dto: OpenEncounterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EncounterResponseDto> {
    const result = await this.opening.open(claimsOf(request), dto, request.requestId);
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.encounter;
  }

  /** 7.2 — participant doctor or admin (`user/*.read`). */
  @Get(':id')
  @ApiOperation({ summary: '7.2 Get encounter details' })
  @ApiParam({ name: 'id', description: 'Encounter id (FHIR id)' })
  @ApiResponse({ status: 200, description: 'Encounter with its clinical content once finished', type: EncounterDetailsDoc })
  @ApiProblems([400, ...GUARD_PROBLEM_STATUSES, 404], { 404: 'NOT_FOUND: encounter not found' })
  @RequiresRoles(Role.DOCTOR, Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_READ)
  async findOne(@Req() request: RequestWithClaims, @Param('id', FhirIdPipe) id: string): Promise<EncounterDetailsDto> {
    return this.encounters.findOne(claimsOf(request), id);
  }

  /** 7.3 — one atomic completion; a replay answers `409 ENCOUNTER_STATE_INVALID`. */
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '7.3 Complete an encounter (diagnoses, plan, prescriptions)' })
  @ApiParam({ name: 'id', description: 'Encounter id (FHIR id)' })
  @ApiResponse({ status: 200, description: 'Encounter finished, appointment fulfilled', type: EncounterResponseDoc })
  @ApiProblems([400, ...GUARD_PROBLEM_STATUSES, 404, 409, 422], {
    409: 'ENCOUNTER_STATE_INVALID: already completed or appointment no longer booked (replay); CONSENT_REQUIRED: no active EHR consent',
    422: 'INVALID_ICD10_CODE / TERMINOLOGY_NOT_FOUND: details[] names the request fields',
  })
  @RequiresRoles(Role.DOCTOR)
  @RequiresScopes(SMART_SCOPES.USER_WRITE)
  async complete(
    @Req() request: AuditedRequest,
    @Param('id', FhirIdPipe) id: string,
    @Body() dto: CompleteEncounterDto,
  ): Promise<EncounterResponseDto> {
    return this.encounters.complete(claimsOf(request), id, dto, request.requestId);
  }
}
