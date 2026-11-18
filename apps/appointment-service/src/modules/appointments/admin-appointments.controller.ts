import { Controller, Get, Headers, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblems, claimsOf, GUARD_PROBLEM_STATUSES, RequiresRoles, RequiresScopes } from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';
import { PatientReadAudit } from '@medcenter/fhir';
import { resolveContentLanguage } from '@medcenter/fhir-mappers';

import { AppointmentQueriesService, type AppointmentPage } from './appointment-queries.service';
import type { AuditedRequest } from './audit';
import { AppointmentPageDoc } from './dto/appointment-response.doc';
import { ListAdminAppointmentsQueryDto } from './dto/list-admin-appointments-query.dto';
import { toPageQuery } from './dto/page-query.dto';

@ApiTags('appointment')
@ApiBearerAuth()
@Controller('api/v1/admin/appointments')
export class AdminAppointmentsController {
  constructor(
    private readonly queries: AppointmentQueriesService,
    private readonly readAudit: PatientReadAudit,
  ) {}

  @Get()
  @RequiresRoles(Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_READ)
  @ApiHeader({
    name: 'Accept-Language',
    required: false,
    description: 'en answers doctorName and serviceName in English where a translation exists; anything else (default) Russian',
  })
  @ApiOperation({ summary: '6.7 List the appointments of all patients (admin)' })
  @ApiResponse({
    status: 200,
    description: 'A page of appointments; the free-text visit reason is not part of the answer',
    type: AppointmentPageDoc,
  })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400], {
    400: 'VALIDATION_ERROR: malformed date, unknown status, malformed practitionerRoleId or paging parameter, or from is after to',
  })
  async list(
    @Req() request: AuditedRequest,
    @Query() query: ListAdminAppointmentsQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<AppointmentPage> {
    const claims = claimsOf(request);
    const page = await this.queries.listForAdmin(
      { ...toPageQuery(query), from: query.from, to: query.to, status: query.status, practitionerRoleId: query.practitionerRoleId },
      resolveContentLanguage(acceptLanguage),
    );
    // One read event per patient shown: the journal answers "who looked at this patient".
    for (const patientId of new Set(page.items.map((item) => item.patientId))) {
      this.readAudit.record({
        interaction: 'search-type',
        outcome: 'success',
        actorSub: claims.sub,
        patientRef: `Patient/${patientId}`,
        source: 'appointment-service',
        requestId: request.requestId,
      });
    }
    return page;
  }
}
