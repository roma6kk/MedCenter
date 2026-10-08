import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '@medcenter/common';

import { DoctorsService } from './doctors.service';
import type { DoctorResponseDto } from './dto/doctor-response.dto';

/** API §4.1–4.2 — public doctor catalog (see API §0 for the public-route list). */
@Controller('api/v1')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Public()
  @Get('doctors')
  async list(
    @Query('serviceId') serviceId?: string,
    @Query('specialty') specialty?: string,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ): Promise<DoctorResponseDto[]> {
    return this.doctorsService.list({ serviceId, specialty, search }, Number(page), Number(pageSize));
  }

  @Public()
  @Get('doctors/:id')
  async findById(@Param('id') id: string): Promise<DoctorResponseDto> {
    return this.doctorsService.findById(id);
  }
}
