import { Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ApiProblems,
  claimsOf,
  GUARD_PROBLEM_STATUSES,
  RequiresRoles,
  RequiresScopes,
  type RequestWithClaims,
} from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';
import { resolveContentLanguage, type AppointmentResponseDto } from '@medcenter/fhir-mappers';

import { AppointmentQueriesService, type AppointmentPage } from './appointment-queries.service';
import { AppointmentsService } from './appointments.service';
import type { AuditedRequest } from './audit';
import { AppointmentPageDoc, AppointmentResponseDoc } from './dto/appointment-response.doc';
import { ListDoctorAppointmentsQueryDto } from './dto/list-doctor-appointments-query.dto';
import { toPageQuery } from './dto/page-query.dto';
import { FhirIdPipe } from './fhir-id.pipe';

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
  @ApiHeader({
    name: 'Accept-Language',
    required: false,
    description: 'en answers doctorName and serviceName in English where a translation exists; anything else (default) Russian',
  })
  @ApiOperation({ summary: '6.5 List the appointments of the signed-in doctor' })
  @ApiResponse({
    status: 200,
    description: 'A page of appointments where the doctor is a participant',
    type: AppointmentPageDoc,
  })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400], {
    400: 'VALIDATION_ERROR: malformed date, unknown status, malformed patient id or paging parameter, or from is after to',
    403: 'COMPARTMENT_VIOLATION: the token has no PractitionerRole identity; FORBIDDEN_ROLE / FORBIDDEN_SCOPE',
  })
  async list(
    @Req() request: RequestWithClaims,
    @Query() query: ListDoctorAppointmentsQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<AppointmentPage> {
    return this.queries.listForDoctor(claimsOf(request), {
      ...toPageQuery(query),
      from: query.from,
      to: query.to,
      status: query.status,
      patient: query.patient,
    }, resolveContentLanguage(acceptLanguage));
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
    409: 'ENCOUNTER_STATE_INVALID: not booked, an encounter already exists, or the appointment has not started yet',
  })
  async noShow(
    @Req() request: AuditedRequest,
    @Param('id', FhirIdPipe) id: string,
  ): Promise<AppointmentResponseDto> {
    return this.appointments.markNoShow(claimsOf(request), id, request.requestId);
  }
}
