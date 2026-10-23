import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ApiProblems,
  auditActorOf,
  claimsOf,
  GUARD_PROBLEM_STATUSES,
  IdempotencyService,
  RequiresRoles,
  type AuditedRequest,
  type RequestWithClaims,
} from '@medcenter/common';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, Role } from '@medcenter/contracts';
import type { SlotResponseDto } from '@medcenter/fhir-mappers';

import { FhirIdParamDto } from '../../common/fhir-id-param.dto';
import type { ScheduleSummaryDto } from '../slots/dto/doctor-schedule-response.dto';
import {
  SchedulePageDoc,
  ScheduleSummaryDoc,
  SlotResponseDoc,
} from '../slots/dto/slot-response.doc';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { GenerateSlotsResultDoc } from './dto/generate-slots-result.doc';
import { DeleteScheduleDto } from './dto/delete-schedule.dto';
import { GenerateSlotsDto } from './dto/generate-slots.dto';
import { ListSchedulesQueryDto } from './dto/list-schedules-query.dto';
import { ScheduleSlotsQueryDto } from './dto/schedule-slots-query.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import type { GenerateSlotsResult } from './slot-generator.service';
import { SlotGeneratorService } from './slot-generator.service';
import { SchedulesService, type SchedulePage } from './schedules.service';

/** API §5.2 — schedules are admin-only (BR-007). */
@ApiTags('catalog')
@ApiBearerAuth()
@Controller('api/v1/admin/schedules')
export class SchedulesController {
  constructor(
    private readonly schedulesService: SchedulesService,
    private readonly slotGenerator: SlotGeneratorService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @RequiresRoles(Role.ADMIN)
  @ApiOperation({ summary: '5.2.1 Create a schedule' })
  @ApiResponse({ status: 201, description: 'The created schedule', type: ScheduleSummaryDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 409], {
    409: 'SCHEDULE_OVERLAP: planning horizon overlaps another schedule of the PractitionerRole',
  })
  async create(
    @Req() request: AuditedRequest,
    @Body() dto: CreateScheduleDto,
  ): Promise<ScheduleSummaryDto> {
    return this.schedulesService.create(dto, auditActorOf(request));
  }

  @Get()
  @RequiresRoles(Role.ADMIN)
  @ApiOperation({ summary: '5.2.2 List schedules' })
  @ApiResponse({ status: 200, description: 'A page of schedules', type: SchedulePageDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400])
  async list(@Query() query: ListSchedulesQueryDto): Promise<SchedulePage> {
    return this.schedulesService.list(
      query.page ?? DEFAULT_PAGE,
      query.pageSize ?? DEFAULT_PAGE_SIZE,
      query.doctorId,
      query.active,
    );
  }

  @Patch(':id')
  @RequiresRoles(Role.ADMIN)
  @ApiOperation({ summary: '5.2.3 Update a schedule window or horizon' })
  @ApiResponse({ status: 200, description: 'The updated schedule', type: ScheduleSummaryDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404, 409], {
    409: 'SCHEDULE_OVERLAP: planning horizon overlaps another schedule of the PractitionerRole',
  })
  async update(
    @Req() request: AuditedRequest,
    @Param() params: FhirIdParamDto,
    @Body() dto: UpdateScheduleDto,
  ): Promise<ScheduleSummaryDto> {
    return this.schedulesService.update(params.id, dto, auditActorOf(request));
  }

  @Delete(':id')
  @RequiresRoles(Role.ADMIN)
  @ApiOperation({ summary: '5.2.4 Delete (or deactivate) a schedule' })
  @ApiResponse({
    status: 204,
    description:
      'The schedule is deleted, or deactivated when appointments still reference its slots',
  })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404, 409], {
    409: 'SCHEDULE_IN_USE: slots protect the schedule (any slot without cascade, busy slots always)',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() request: AuditedRequest,
    @Param() params: FhirIdParamDto,
    @Body() dto: DeleteScheduleDto,
  ): Promise<void> {
    await this.schedulesService.remove(params.id, dto.cascade === true, auditActorOf(request));
  }

  @Post(':id/generate')
  @RequiresRoles(Role.ADMIN)
  @ApiOperation({ summary: '5.2.5 Generate slots for a period' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Replays the cached answer for 24 h (API §0)',
  })
  @ApiResponse({
    status: 201,
    description: 'Slots generated; existing ones are skipped',
    type: GenerateSlotsResultDoc,
  })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404, 409], {
    409: 'CONFLICT: the schedule is deactivated (active=false)',
  })
  async generate(
    @Req() request: RequestWithClaims,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param() params: FhirIdParamDto,
    @Body() dto: GenerateSlotsDto,
  ): Promise<GenerateSlotsResult> {
    // API §0: a replayed `Idempotency-Key` is answered from the cache (24 h), per caller and schedule.
    const scope = `generate:${claimsOf(request).sub}:${params.id}`;
    return this.idempotency.run(scope, idempotencyKey, dto, () =>
      this.slotGenerator.generate(params.id, dto),
    );
  }

  @Get(':id/slots')
  @RequiresRoles(Role.ADMIN)
  @ApiOperation({ summary: '5.2.6 List the slots of a schedule' })
  @ApiResponse({
    status: 200,
    description: 'Slots sorted by start, no pagination',
    type: SlotResponseDoc,
    isArray: true,
  })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404])
  async slots(
    @Param() params: FhirIdParamDto,
    @Query() query: ScheduleSlotsQueryDto,
  ): Promise<SlotResponseDto[]> {
    return this.schedulesService.listSlots(params.id, query.from, query.to, query.status);
  }
}
