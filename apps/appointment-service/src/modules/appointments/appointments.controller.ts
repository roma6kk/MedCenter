import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { claimsOf, RequiresRoles, RequiresScopes, type RequestWithClaims } from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';
import type { AppointmentResponseDto } from '@medcenter/fhir-mappers';

import { IdempotencyService } from '../idempotency/idempotency.service';
import { AppointmentsService } from './appointments.service';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

/** API §6.1, §6.4 — patient booking and cancellation (FR-004/005). */
@Controller('api/v1/appointments')
export class AppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_WRITE)
  async create(
    @Req() request: RequestWithClaims,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    const claims = claimsOf(request);
    return this.idempotency.run(claims.sub, idempotencyKey, dto, () => this.appointments.book(claims, dto));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequiresRoles(Role.PATIENT, Role.ADMIN)
  async cancel(
    @Req() request: RequestWithClaims,
    @Param('id') id: string,
    @Body() dto: CancelAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    return this.appointments.cancel(claimsOf(request), id, dto);
  }
}

/** API §6.6 — doctor marks a no-show (FR-006). Ownership as a participant is not checked yet; see the spec. */
@Controller('api/v1/doctor/appointments')
export class DoctorAppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post(':id/noshow')
  @HttpCode(HttpStatus.OK)
  @RequiresRoles(Role.DOCTOR)
  @RequiresScopes(SMART_SCOPES.USER_WRITE)
  async noShow(@Req() request: RequestWithClaims, @Param('id') id: string): Promise<AppointmentResponseDto> {
    return this.appointments.markNoShow(claimsOf(request), id);
  }
}
