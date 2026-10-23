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
import { auditActorOf, claimsOf, IdempotencyService, RequiresRoles, type AuditedRequest, type RequestWithClaims } from '@medcenter/common';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, Role } from '@medcenter/contracts';
import type { SlotResponseDto } from '@medcenter/fhir-mappers';

import { FhirIdParamDto } from '../../common/fhir-id-param.dto';
import type { ScheduleSummaryDto } from '../slots/dto/doctor-schedule-response.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { DeleteScheduleDto } from './dto/delete-schedule.dto';
import { GenerateSlotsDto } from './dto/generate-slots.dto';
import { ListSchedulesQueryDto } from './dto/list-schedules-query.dto';
import { ScheduleSlotsQueryDto } from './dto/schedule-slots-query.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import type { GenerateSlotsResult } from './slot-generator.service';
import { SlotGeneratorService } from './slot-generator.service';
import { SchedulesService, type SchedulePage } from './schedules.service';

/** API §5.2 — schedules are admin-only (BR-007). */
@Controller('api/v1/admin/schedules')
export class SchedulesController {
  constructor(
    private readonly schedulesService: SchedulesService,
    private readonly slotGenerator: SlotGeneratorService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @RequiresRoles(Role.ADMIN)
  async create(@Req() request: AuditedRequest, @Body() dto: CreateScheduleDto): Promise<ScheduleSummaryDto> {
    return this.schedulesService.create(dto, auditActorOf(request));
  }

  @Get()
  @RequiresRoles(Role.ADMIN)
  async list(@Query() query: ListSchedulesQueryDto): Promise<SchedulePage> {
    return this.schedulesService.list(query.page ?? DEFAULT_PAGE, query.pageSize ?? DEFAULT_PAGE_SIZE, query.doctorId, query.active);
  }

  @Patch(':id')
  @RequiresRoles(Role.ADMIN)
  async update(
    @Req() request: AuditedRequest,
    @Param() params: FhirIdParamDto,
    @Body() dto: UpdateScheduleDto,
  ): Promise<ScheduleSummaryDto> {
    return this.schedulesService.update(params.id, dto, auditActorOf(request));
  }

  @Delete(':id')
  @RequiresRoles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: AuditedRequest, @Param() params: FhirIdParamDto, @Body() dto: DeleteScheduleDto): Promise<void> {
    await this.schedulesService.remove(params.id, dto.cascade === true, auditActorOf(request));
  }

  @Post(':id/generate')
  @RequiresRoles(Role.ADMIN)
  async generate(
    @Req() request: RequestWithClaims,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param() params: FhirIdParamDto,
    @Body() dto: GenerateSlotsDto,
  ): Promise<GenerateSlotsResult> {
    // API §0: a replayed `Idempotency-Key` is answered from the cache (24 h), per caller and schedule.
    const scope = `generate:${claimsOf(request).sub}:${params.id}`;
    return this.idempotency.run(scope, idempotencyKey, dto, () => this.slotGenerator.generate(params.id, dto));
  }

  @Get(':id/slots')
  @RequiresRoles(Role.ADMIN)
  async slots(
    @Param() params: FhirIdParamDto,
    @Query() query: ScheduleSlotsQueryDto,
  ): Promise<SlotResponseDto[]> {
    return this.schedulesService.listSlots(params.id, query.from, query.to, query.status);
  }
}
