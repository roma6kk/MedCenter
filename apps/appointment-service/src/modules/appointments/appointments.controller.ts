import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { claimsOf, IdempotencyService, RequiresRoles, RequiresScopes, type RequestWithClaims } from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';
import type { AppointmentResponseDto } from '@medcenter/fhir-mappers';

import { AppointmentQueriesService, type AppointmentPage } from './appointment-queries.service';
import { AppointmentsService } from './appointments.service';
import type { AuditedRequest } from './audit';
import type { AppointmentViewDto } from './dto/appointment-view.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { toPageQuery } from './dto/page-query.dto';
import { FhirIdPipe } from './fhir-id.pipe';
import { assertRoleScope } from './scope-policy';

/** API §6.1–6.4 — patient booking, own appointments, details and cancellation (FR-004/005). */
@Controller('api/v1/appointments')
export class AppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly queries: AppointmentQueriesService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_WRITE)
  async create(
    @Req() request: AuditedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    const claims = claimsOf(request);
    return this.idempotency.run(claims.sub, idempotencyKey, dto, () => this.appointments.book(claims, dto, request.requestId));
  }

  /** 6.2 — the caller's own appointments; the patient comes from the token only (ADR-013). */
  @Get()
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_READ)
  async list(@Req() request: RequestWithClaims, @Query() query: ListAppointmentsQueryDto): Promise<AppointmentPage> {
    return this.queries.listForPatient(claimsOf(request), { ...toPageQuery(query), upcoming: query.upcoming === 'true' });
  }

  /** 6.3 — owner patient (`patient/*.read`), participant doctor or admin (`user/*.read`). */
  @Get(':id')
  @RequiresRoles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  async findOne(@Req() request: RequestWithClaims, @Param('id', FhirIdPipe) id: string): Promise<AppointmentViewDto> {
    const claims = claimsOf(request);
    assertRoleScope(claims, 'read');
    return this.queries.findById(claims, id);
  }

  /** 6.4 — owner patient (`patient/*.write`) or admin (`user/*.write`). */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequiresRoles(Role.PATIENT, Role.ADMIN)
  async cancel(
    @Req() request: AuditedRequest,
    @Param('id', FhirIdPipe) id: string,
    @Body() dto: CancelAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    const claims = claimsOf(request);
    assertRoleScope(claims, 'write');
    return this.appointments.cancel(claims, id, dto, request.requestId);
  }
}
