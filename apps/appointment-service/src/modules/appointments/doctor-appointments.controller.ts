import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ApiProblems,
  claimsOf,
  GUARD_PROBLEM_STATUSES,
  RequiresRoles,
  RequiresScopes,
  type RequestWithClaims,
} from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';
import type { AppointmentResponseDto } from '@medcenter/fhir-mappers';

import { AppointmentQueriesService, type AppointmentPage } from './appointment-queries.service';
import { AppointmentsService } from './appointments.service';
import type { AuditedRequest } from './audit';
import { AppointmentPageDoc, AppointmentResponseDoc } from './dto/appointment-response.doc';
import { ListDoctorAppointmentsQueryDto } from './dto/list-doctor-appointments-query.dto';
import { toPageQuery } from './dto/page-query.dto';
import { FhirIdPipe } from './fhir-id.pipe';

/**
 * API §6.5–6.6 — the doctor's own appointments and no-show (FR-006/009). The
 * doctor is identified by `fhirUser = PractitionerRole/{id}` and must be a
 * participant; a token without that identity fails closed (403).
 */
@ApiTags('appointment')
@ApiBearerAuth()
@Controller('api/v1/doctor/appointments')
export class DoctorAppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly queries: AppointmentQueriesService,
  ) {}

  @Get()
  @RequiresRoles(Role.DOCTOR)
  @RequiresScopes(SMART_SCOPES.USER_READ)
  @ApiOperation({ summary: '6.5 List the appointments of the signed-in doctor' })
  @ApiResponse({
    status: 200,
    description: 'A page of appointments where the doctor is a participant',
    type: AppointmentPageDoc,
  })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400], {
    400: 'VALIDATION_ERROR: malformed date or paging parameter, or from is after to',
    403: 'COMPARTMENT_VIOLATION: the token has no PractitionerRole identity; FORBIDDEN_ROLE / FORBIDDEN_SCOPE',
  })
  async list(
    @Req() request: RequestWithClaims,
    @Query() query: ListDoctorAppointmentsQueryDto,
  ): Promise<AppointmentPage> {
    return this.queries.listForDoctor(claimsOf(request), {
      ...toPageQuery(query),
      from: query.from,
      to: query.to,
    });
  }

  @Post(':id/noshow')
  @HttpCode(HttpStatus.OK)
  @RequiresRoles(Role.DOCTOR)
  @RequiresScopes(SMART_SCOPES.USER_WRITE)
  @ApiOperation({ summary: '6.6 Mark an appointment as no-show' })
  @ApiParam({ name: 'id', description: 'Appointment id (FHIR id)' })
  @ApiResponse({
    status: 200,
    description: 'The appointment with status noshow',
    type: AppointmentResponseDoc,
  })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404, 409], {
    403: 'COMPARTMENT_VIOLATION: the doctor is not a participant; FORBIDDEN_ROLE / FORBIDDEN_SCOPE',
    409: 'ENCOUNTER_STATE_INVALID: not booked, or an encounter already exists',
  })
  async noShow(
    @Req() request: AuditedRequest,
    @Param('id', FhirIdPipe) id: string,
  ): Promise<AppointmentResponseDto> {
    return this.appointments.markNoShow(claimsOf(request), id, request.requestId);
  }
}
