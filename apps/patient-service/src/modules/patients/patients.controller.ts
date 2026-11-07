import { Controller, Get, HttpStatus, Param, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblems, claimsOf, GUARD_PROBLEM_STATUSES, RequiresRoles, type RequestWithClaims, type RequestWithRequestId } from '@medcenter/common';
import { Role } from '@medcenter/contracts';

import { PatientIdParamsDto } from './dto/patient-id-params.dto';
import type { PatientResponseDto } from './dto/patient-response.dto';
import { PatientResponseDoc } from './dto/patient-response.doc';
import { PatientsService } from './patients.service';

@ApiTags('patient')
@ApiBearerAuth()
@Controller('api/v1/patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get(':id')
  @RequiresRoles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: '3.2 Get a patient card' })
  @ApiResponse({ status: HttpStatus.OK, type: PatientResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404], {
    403: 'FORBIDDEN_SCOPE | FORBIDDEN_ROLE | COMPARTMENT_VIOLATION: foreign patient',
  })
  async getById(
    @Req() request: RequestWithClaims & Pick<RequestWithRequestId, 'requestId'>,
    @Param() params: PatientIdParamsDto,
  ): Promise<PatientResponseDto> {
    return this.patients.getById(params.id, claimsOf(request), request.requestId);
  }
}
