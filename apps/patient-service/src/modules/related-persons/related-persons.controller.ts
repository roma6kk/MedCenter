import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { claimsOf, RequiresRoles, type RequestWithClaims, type RequestWithRequestId } from '@medcenter/common';
import { Role, type PaginatedResponseDto } from '@medcenter/contracts';

import { PatientIdParamsDto } from '../patients/dto/patient-id-params.dto';
import { ListRelatedPersonsQueryDto } from './dto/list-related-persons-query.dto';
import type { RelatedPersonResponseDto } from './dto/related-person-response.dto';
import { RelatedPersonsService } from './related-persons.service';

/** API §3.3 — trusted persons (`RelatedPerson`) of a patient; access rules as for §3.2. */
@Controller('api/v1/patients')
export class RelatedPersonsController {
  constructor(private readonly relatedPersons: RelatedPersonsService) {}

  @Get(':id/related')
  @RequiresRoles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  async list(
    @Req() request: RequestWithClaims & Pick<RequestWithRequestId, 'requestId'>,
    @Param() params: PatientIdParamsDto,
    @Query() query: ListRelatedPersonsQueryDto,
  ): Promise<PaginatedResponseDto<RelatedPersonResponseDto>> {
    return this.relatedPersons.listForPatient(
      params.id,
      claimsOf(request),
      { page: query.page, pageSize: query.pageSize },
      request.requestId,
    );
  }
}
