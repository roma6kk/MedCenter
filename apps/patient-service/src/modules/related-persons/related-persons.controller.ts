import { Controller, Get, HttpStatus, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblems, claimsOf, GUARD_PROBLEM_STATUSES, RequiresRoles, type RequestWithClaims, type RequestWithRequestId } from '@medcenter/common';
import { Role, type PaginatedResponseDto } from '@medcenter/contracts';

import { PatientIdParamsDto } from '../patients/dto/patient-id-params.dto';
import { ListRelatedPersonsQueryDto } from './dto/list-related-persons-query.dto';
import { RelatedPersonPageDoc } from './dto/related-person-response.doc';
import type { RelatedPersonResponseDto } from './dto/related-person-response.dto';
import { RelatedPersonsService } from './related-persons.service';

/** API §3.3 — trusted persons (`RelatedPerson`) of a patient; access rules as for §3.2. */
@ApiTags('patient')
@ApiBearerAuth()
@Controller('api/v1/patients')
export class RelatedPersonsController {
  constructor(private readonly relatedPersons: RelatedPersonsService) {}

  @Get(':id/related')
  @RequiresRoles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: '3.3 List the trusted persons of a patient' })
  @ApiResponse({ status: HttpStatus.OK, type: RelatedPersonPageDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404], {
    403: 'FORBIDDEN_SCOPE | FORBIDDEN_ROLE | COMPARTMENT_VIOLATION: foreign patient',
  })
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
