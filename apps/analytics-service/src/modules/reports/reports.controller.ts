import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblems, GUARD_PROBLEM_STATUSES, RequiresRoles, RequiresScopes } from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';
import { resolveContentLanguage } from '@medcenter/fhir-mappers';

import { DateRangeQueryDto } from '../shared/date-range-query.dto';
import { AppointmentsSummaryDoc, EncountersSummaryDoc, ServicesPopularityDoc } from './dto/measure-report.doc';
import type { AppointmentsSummaryDto } from './dto/appointments-summary.dto';
import type { EncountersSummaryDto } from './dto/encounters-summary.dto';
import { ServicesPopularityQueryDto, type ServicesPopularityDto } from './dto/services-popularity.dto';
import { ReportsService } from './reports.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('api/v1/admin/analytics')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('appointments')
  @ApiOperation({ summary: '9.1 Appointments summary by status' })
  @ApiResponse({ status: 200, description: 'booked / fulfilled / cancelled / no-show counts', type: AppointmentsSummaryDoc })
  @ApiProblems([400, ...GUARD_PROBLEM_STATUSES], { 400: 'VALIDATION_ERROR: malformed bound, from > to or range longer than 366 days' })
  @RequiresScopes(SMART_SCOPES.USER_READ)
  @RequiresRoles(Role.ADMIN)
  appointments(@Query() query: DateRangeQueryDto): Promise<AppointmentsSummaryDto> {
    return this.reportsService.appointmentsSummary(query);
  }

  @Get('encounters')
  @ApiOperation({ summary: '9.2 Completed encounters by specialty' })
  @ApiResponse({ status: 200, description: 'Counts per practitioner specialty', type: EncountersSummaryDoc })
  @ApiProblems([400, ...GUARD_PROBLEM_STATUSES], { 400: 'VALIDATION_ERROR: malformed bound, from > to or range longer than 366 days' })
  @RequiresScopes(SMART_SCOPES.USER_READ)
  @RequiresRoles(Role.ADMIN)
  encounters(@Query() query: DateRangeQueryDto): Promise<EncountersSummaryDto> {
    return this.reportsService.encountersSummary(query);
  }

  @Get('services-popularity')
  @ApiOperation({ summary: '9.3 Most booked services; the name follows Accept-Language: en, else ru' })
  @ApiResponse({ status: 200, description: 'Top services, most popular first', type: ServicesPopularityDoc })
  @ApiProblems([400, ...GUARD_PROBLEM_STATUSES], { 400: 'VALIDATION_ERROR: malformed bound, from > to or range longer than 366 days' })
  @RequiresScopes(SMART_SCOPES.USER_READ)
  @RequiresRoles(Role.ADMIN)
  servicesPopularity(
    @Query() query: ServicesPopularityQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<ServicesPopularityDto> {
    return this.reportsService.servicesPopularity(query, resolveContentLanguage(acceptLanguage));
  }
}
