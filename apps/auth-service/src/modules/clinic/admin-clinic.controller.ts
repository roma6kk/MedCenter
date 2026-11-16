import { Body, Controller, Patch, Req, UseInterceptors } from '@nestjs/common';
import { ApiProblems, GUARD_PROBLEM_STATUSES, RequiresRoles, RequiresScopes } from '@medcenter/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role, SMART_SCOPES } from '@medcenter/contracts';

import { NoStoreInterceptor } from '../users/no-store.interceptor';
import { actorOf, type AuthenticatedRequest } from '../users/request-actor';
import { ClinicService } from './clinic.service';
import type { ClinicDetails } from './clinic.store';
import { ClinicResponseDto } from './dto/clinic-response.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('api/v1/admin/clinic')
@UseInterceptors(NoStoreInterceptor)
export class AdminClinicController {
  constructor(private readonly clinic: ClinicService) {}

  @Patch()
  @ApiOperation({ summary: '2.4.2 Update the public details of the clinic' })
  @ApiResponse({ status: 200, description: 'The details after the change', type: ClinicResponseDto })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400])
  @RequiresRoles(Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_WRITE)
  update(@Body() dto: UpdateClinicDto, @Req() request: AuthenticatedRequest): Promise<ClinicDetails> {
    return this.clinic.update(dto, actorOf(request));
  }
}
