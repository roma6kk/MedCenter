import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RequiresRoles } from '@medcenter/common';
import { Role } from '@medcenter/contracts';
import type { FhirResource } from '@medcenter/fhir';
import type { SlotResponseDto } from '@medcenter/fhir-mappers';

import { CreateScheduleDto } from './dto/create-schedule.dto';
import { DeleteScheduleDto } from './dto/delete-schedule.dto';
import { GenerateSlotsDto } from './dto/generate-slots.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import type { GenerateSlotsResult } from './slot-generator.service';
import { SlotGeneratorService } from './slot-generator.service';
import { SchedulesService } from './schedules.service';

/** API §5.2 — schedules are admin-only (BR-007). */
@Controller('api/v1/admin/schedules')
export class SchedulesController {
  constructor(
    private readonly schedulesService: SchedulesService,
    private readonly slotGenerator: SlotGeneratorService,
  ) {}

  @Post()
  @RequiresRoles(Role.ADMIN)
  async create(@Body() dto: CreateScheduleDto): Promise<FhirResource> {
    return this.schedulesService.create(dto);
  }

  @Get()
  @RequiresRoles(Role.ADMIN)
  async list(
    @Query('doctorId') doctorId?: string,
    @Query('active') active?: string,
  ): Promise<FhirResource[]> {
    return this.schedulesService.list(doctorId, active);
  }

  @Patch(':id')
  @RequiresRoles(Role.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
  ): Promise<FhirResource> {
    return this.schedulesService.update(id, dto);
  }

  @Delete(':id')
  @RequiresRoles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Body() dto: DeleteScheduleDto): Promise<void> {
    await this.schedulesService.remove(id, dto.cascade === true);
  }

  @Post(':id/generate')
  @RequiresRoles(Role.ADMIN)
  async generate(
    @Param('id') id: string,
    @Body() dto: GenerateSlotsDto,
  ): Promise<GenerateSlotsResult> {
    return this.slotGenerator.generate(id, dto);
  }

  @Get(':id/slots')
  @RequiresRoles(Role.ADMIN)
  async slots(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('status') status?: string,
  ): Promise<SlotResponseDto[]> {
    return this.schedulesService.listSlots(id, from, to, status);
  }
}
