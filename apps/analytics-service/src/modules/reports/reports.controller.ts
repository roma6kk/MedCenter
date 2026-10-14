import { Controller, Get, Query } from '@nestjs/common';
import { RequiresRoles, RequiresScopes } from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';

import { DateRangeQueryDto } from '../shared/date-range-query.dto';
import type { AppointmentsSummaryDto } from './dto/appointments-summary.dto';
import type { EncountersSummaryDto } from './dto/encounters-summary.dto';
import { ServicesPopularityQueryDto, type ServicesPopularityDto } from './dto/services-popularity.dto';
import { ReportsService } from './reports.service';

/** API §9.1–9.3 (FR-019) — administrator dashboards only (BR-007). */
@Controller('api/v1/admin/analytics')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /** §9.1 — booked / cancelled / no-show in the period (by `Appointment.start`). */
  @Get('appointments')
  @RequiresScopes(SMART_SCOPES.USER_READ)
  @RequiresRoles(Role.ADMIN)
  appointments(@Query() query: DateRangeQueryDto): Promise<AppointmentsSummaryDto> {
    return this.reportsService.appointmentsSummary(query);
  }

  /** §9.2 — completed encounters by the practitioner's specialty. */
  @Get('encounters')
  @RequiresScopes(SMART_SCOPES.USER_READ)
  @RequiresRoles(Role.ADMIN)
  encounters(@Query() query: DateRangeQueryDto): Promise<EncountersSummaryDto> {
    return this.reportsService.encountersSummary(query);
  }

  /** §9.3 — the `top` most booked services (default 10). */
  @Get('services-popularity')
  @RequiresScopes(SMART_SCOPES.USER_READ)
  @RequiresRoles(Role.ADMIN)
  servicesPopularity(@Query() query: ServicesPopularityQueryDto): Promise<ServicesPopularityDto> {
    return this.reportsService.servicesPopularity(query);
  }
}
