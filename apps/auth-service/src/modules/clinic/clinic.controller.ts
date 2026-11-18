import { Controller, Get, Header } from '@nestjs/common';
import { ApiProblems, Public } from '@medcenter/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ClinicService } from './clinic.service';
import type { ClinicDetails } from './clinic.store';
import { ClinicResponseDto } from './dto/clinic-response.dto';

@ApiTags('auth')
@Controller('api/v1/clinic')
export class ClinicController {
  constructor(private readonly clinic: ClinicService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '2.4.1 Public details of the clinic' })
  @ApiResponse({ status: 200, description: 'Name, phone, e-mail, address and working hours (Cache-Control: public, max-age=60)', type: ClinicResponseDto })
  @ApiProblems([429, 500])
  @Header('Cache-Control', 'public, max-age=60')
  get(): Promise<ClinicDetails> {
    return this.clinic.get();
  }
}
