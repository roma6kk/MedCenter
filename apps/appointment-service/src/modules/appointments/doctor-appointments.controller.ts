import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { claimsOf, RequiresRoles, RequiresScopes, type RequestWithClaims } from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';
import type { AppointmentResponseDto } from '@medcenter/fhir-mappers';

import { AppointmentQueriesService, type AppointmentPage } from './appointment-queries.service';
import { AppointmentsService } from './appointments.service';
import type { AuditedRequest } from './audit';
import { ListDoctorAppointmentsQueryDto } from './dto/list-doctor-appointments-query.dto';
import { toPageQuery } from './dto/page-query.dto';
import { FhirIdPipe } from './fhir-id.pipe';

/**
 * API §6.5–6.6 — the doctor's own appointments and no-show (FR-006/009). The
 * doctor is identified by `fhirUser = PractitionerRole/{id}` and must be a
 * participant; a token without that identity fails closed (403).
 */
@Controller('api/v1/doctor/appointments')
export class DoctorAppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly queries: AppointmentQueriesService,
  ) {}

  @Get()
  @RequiresRoles(Role.DOCTOR)
  @RequiresScopes(SMART_SCOPES.USER_READ)
  async list(@Req() request: RequestWithClaims, @Query() query: ListDoctorAppointmentsQueryDto): Promise<AppointmentPage> {
    return this.queries.listForDoctor(claimsOf(request), { ...toPageQuery(query), from: query.from, to: query.to });
  }

  @Post(':id/noshow')
  @HttpCode(HttpStatus.OK)
  @RequiresRoles(Role.DOCTOR)
  @RequiresScopes(SMART_SCOPES.USER_WRITE)
  async noShow(@Req() request: AuditedRequest, @Param('id', FhirIdPipe) id: string): Promise<AppointmentResponseDto> {
    return this.appointments.markNoShow(claimsOf(request), id, request.requestId);
  }
}
