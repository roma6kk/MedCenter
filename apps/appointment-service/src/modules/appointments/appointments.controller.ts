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
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiProblems,
  claimsOf,
  GUARD_PROBLEM_STATUSES,
  IdempotencyService,
  RequiresRoles,
  RequiresScopes,
  type RequestWithClaims,
} from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';
import type { AppointmentResponseDto } from '@medcenter/fhir-mappers';

import { AppointmentQueriesService, type AppointmentPage } from './appointment-queries.service';
import { AppointmentsService } from './appointments.service';
import type { AuditedRequest } from './audit';
import {
  AppointmentPageDoc,
  AppointmentResponseDoc,
  AppointmentViewDoc,
} from './dto/appointment-response.doc';
import type { AppointmentViewDto } from './dto/appointment-view.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { toPageQuery } from './dto/page-query.dto';
import { FhirIdPipe } from './fhir-id.pipe';
import { assertRoleScope } from './scope-policy';

/** API §6.1–6.4 — patient booking, own appointments, details and cancellation (FR-004/005). */
@ApiTags('appointment')
@ApiBearerAuth()
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
  @ApiOperation({ summary: '6.1 Book an appointment' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Replays the cached answer for 24 h (API §0)',
  })
  @ApiResponse({
    status: 201,
    description: 'The booked appointment (slot becomes busy)',
    type: AppointmentResponseDoc,
  })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404, 409], {
    400: 'VALIDATION_ERROR: invalid body, or serviceId does not match the schedule of the slot',
    404: 'NOT_FOUND: the slot does not exist',
    409: 'SLOT_CONFLICT: slot already busy; CONSENT_REQUIRED: reason given without an active EHR consent (CONSENT_ENFORCEMENT=block)',
  })
  async create(
    @Req() request: AuditedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    const claims = claimsOf(request);
    return this.idempotency.run(claims.sub, idempotencyKey, dto, () =>
      this.appointments.book(claims, dto, request.requestId),
    );
  }

  /** 6.2 — the caller's own appointments; the patient comes from the token only (ADR-013). */
  @Get()
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_READ)
  @ApiOperation({ summary: '6.2 List own appointments' })
  @ApiResponse({
    status: 200,
    description: 'A page of the caller own appointments',
    type: AppointmentPageDoc,
  })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400], {
    400: 'VALIDATION_ERROR: unknown status value or malformed paging parameter',
  })
  async list(
    @Req() request: RequestWithClaims,
    @Query() query: ListAppointmentsQueryDto,
  ): Promise<AppointmentPage> {
    return this.queries.listForPatient(claimsOf(request), {
      ...toPageQuery(query),
      upcoming: query.upcoming === 'true',
      status: query.status,
    });
  }

  /** 6.3 — owner patient (`patient/*.read`), participant doctor or admin (`user/*.read`). */
  @Get(':id')
  @RequiresRoles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: '6.3 Get an appointment' })
  @ApiParam({ name: 'id', description: 'Appointment id (FHIR id)' })
  @ApiResponse({ status: 200, description: 'The appointment', type: AppointmentViewDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404], {
    403: 'COMPARTMENT_VIOLATION: not the owner patient or participant doctor; FORBIDDEN_ROLE / FORBIDDEN_SCOPE',
  })
  async findOne(
    @Req() request: RequestWithClaims,
    @Param('id', FhirIdPipe) id: string,
  ): Promise<AppointmentViewDto> {
    const claims = claimsOf(request);
    assertRoleScope(claims, 'read');
    return this.queries.findById(claims, id);
  }

  /** 6.4 — owner patient (`patient/*.write`) or admin (`user/*.write`). */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequiresRoles(Role.PATIENT, Role.ADMIN)
  @ApiOperation({ summary: '6.4 Cancel an appointment' })
  @ApiParam({ name: 'id', description: 'Appointment id (FHIR id)' })
  @ApiResponse({
    status: 200,
    description: 'The cancelled appointment (slot becomes free)',
    type: AppointmentResponseDoc,
  })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404, 409], {
    403: 'COMPARTMENT_VIOLATION: not the owner patient; FORBIDDEN_ROLE / FORBIDDEN_SCOPE',
    409: 'APPOINTMENT_NOT_CANCELLABLE: not booked (already cancelled, noshow, fulfilled) or an encounter exists',
  })
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
