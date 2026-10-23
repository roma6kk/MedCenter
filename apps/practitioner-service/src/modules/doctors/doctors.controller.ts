import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblems, Public } from '@medcenter/common';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@medcenter/contracts';

import { DoctorsService, type DoctorPage } from './doctors.service';
import { DoctorIdParamDto } from './dto/doctor-id-param.dto';
import { DoctorPageDoc, DoctorResponseDoc } from './dto/doctor-response.doc';
import type { DoctorResponseDto } from './dto/doctor-response.dto';
import { ListDoctorsQueryDto } from './dto/list-doctors-query.dto';

/** API §4.1–4.2 — public doctor catalog (see API §0 for the public-route list). */
@ApiTags('practitioner')
@Controller('api/v1')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Public()
  @Get('doctors')
  @ApiOperation({ summary: '4.1 List the doctors of the catalog (public)' })
  @ApiResponse({ status: HttpStatus.OK, type: DoctorPageDoc })
  @ApiProblems([400, 429, 500])
  async list(@Query() query: ListDoctorsQueryDto): Promise<DoctorPage> {
    const { serviceId, specialty, search } = query;
    return this.doctorsService.list(
      { serviceId, specialty, search },
      query.page ?? DEFAULT_PAGE,
      query.pageSize ?? DEFAULT_PAGE_SIZE,
    );
  }

  @Public()
  @Get('doctors/:id')
  @ApiOperation({ summary: '4.2 Get a doctor card (public)' })
  @ApiResponse({ status: HttpStatus.OK, type: DoctorResponseDoc })
  @ApiProblems([400, 404, 429, 500])
  async findById(@Param() params: DoctorIdParamDto): Promise<DoctorResponseDto> {
    return this.doctorsService.findById(params.id);
  }
}
