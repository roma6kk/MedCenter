import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '@medcenter/common';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@medcenter/contracts';

import { DoctorsService, type DoctorPage } from './doctors.service';
import { DoctorIdParamDto } from './dto/doctor-id-param.dto';
import type { DoctorResponseDto } from './dto/doctor-response.dto';
import { ListDoctorsQueryDto } from './dto/list-doctors-query.dto';

/** API §4.1–4.2 — public doctor catalog (see API §0 for the public-route list). */
@Controller('api/v1')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Public()
  @Get('doctors')
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
  async findById(@Param() params: DoctorIdParamDto): Promise<DoctorResponseDto> {
    return this.doctorsService.findById(params.id);
  }
}
