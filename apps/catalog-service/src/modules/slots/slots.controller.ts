import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ApiProblems,
  claimsOf,
  GUARD_PROBLEM_STATUSES,
  Public,
  RequiresRoles,
  RequiresScopes,
  type RequestWithClaims,
} from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';

import { DoctorScheduleService } from './doctor-schedule.service';
import { DoctorSlotsService } from './doctor-slots.service';
import { DoctorIdParamDto } from './dto/doctor-id-param.dto';
import type { DoctorScheduleResponseDto } from './dto/doctor-schedule-response.dto';
import type { DoctorSlotsResponseDto } from './dto/doctor-slots-response.dto';
import { SlotRangeQueryDto } from './dto/slot-range-query.dto';
import { DoctorScheduleResponseDoc, DoctorSlotsResponseDoc } from './dto/slot-response.doc';
import { requirePractitionerRoleId } from './practitioner-role-ref';
import { resolveSlotRange } from './slot-range';

/**
 * API §5.2.7 (doctor's own schedule) and §5.2.8 (public free slots). Traefik
 * routes `/api/v1/doctor/schedule` and `^/api/v1/doctors/[^/]+/slots$` here;
 * the rest of `/api/v1/doctors` belongs to practitioner-service.
 */
@ApiTags('catalog')
@Controller('api/v1')
export class SlotsController {
  constructor(
    private readonly doctorSlots: DoctorSlotsService,
    private readonly doctorSchedule: DoctorScheduleService,
  ) {}

  @Public()
  @Get('doctors/:id/slots')
  @ApiOperation({ summary: '5.2.8 List the free slots of a doctor' })
  @ApiResponse({
    status: 200,
    description: 'Free slots of the range, sorted by start',
    type: DoctorSlotsResponseDoc,
  })
  @ApiProblems([400, 429, 500])
  async listDoctorSlots(
    @Param() params: DoctorIdParamDto,
    @Query() query: SlotRangeQueryDto,
  ): Promise<DoctorSlotsResponseDto> {
    return this.doctorSlots.listFree(params.id, resolveSlotRange(query));
  }

  @Get('doctor/schedule')
  @RequiresRoles(Role.DOCTOR)
  @RequiresScopes(SMART_SCOPES.USER_READ)
  @ApiBearerAuth()
  @ApiOperation({ summary: '5.2.7 Get the signed-in doctor schedule with slots' })
  @ApiResponse({
    status: 200,
    description: 'Own schedules and their slots in the range',
    type: DoctorScheduleResponseDoc,
  })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400], {
    403: 'The token has no PractitionerRole identity (COMPARTMENT_VIOLATION), role or scope not allowed',
  })
  async ownSchedule(
    @Req() request: RequestWithClaims,
    @Query() query: SlotRangeQueryDto,
  ): Promise<DoctorScheduleResponseDto> {
    // Identity before the cross-field range rules (limits, defaults): a token without a
    // PractitionerRole learns nothing about them. A malformed date is caught earlier, by
    // the validation pipe, before this method runs.
    const practitionerRoleId = requirePractitionerRoleId(claimsOf(request));
    return this.doctorSchedule.forRole(practitionerRoleId, resolveSlotRange(query));
  }
}
