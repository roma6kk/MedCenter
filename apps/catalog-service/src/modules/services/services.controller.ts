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
  Req,
} from '@nestjs/common';
import { auditActorOf, Public, RequiresRoles, type AuditedRequest } from '@medcenter/common';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, Role } from '@medcenter/contracts';

import { FhirIdParamDto } from '../../common/fhir-id-param.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { ListServicesQueryDto } from './dto/list-services-query.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import type { ServiceResponseDto } from './dto/service-response.dto';
import { ServicesService, type ServicePage } from './services.service';

/** API §5.1. Public reads; admin writes carry `ADMIN` (BR-007). */
@Controller('api/v1')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Public()
  @Get('services')
  async list(@Query() query: ListServicesQueryDto): Promise<ServicePage> {
    return this.servicesService.list(query.page ?? DEFAULT_PAGE, query.pageSize ?? DEFAULT_PAGE_SIZE, query.search);
  }

  @Public()
  @Get('services/:id')
  async findById(@Param() params: FhirIdParamDto): Promise<ServiceResponseDto> {
    return this.servicesService.findById(params.id);
  }

  @Post('admin/services')
  @RequiresRoles(Role.ADMIN)
  async create(@Req() request: AuditedRequest, @Body() dto: CreateServiceDto): Promise<ServiceResponseDto> {
    return this.servicesService.create(dto, auditActorOf(request));
  }

  @Patch('admin/services/:id')
  @RequiresRoles(Role.ADMIN)
  async update(
    @Req() request: AuditedRequest,
    @Param() params: FhirIdParamDto,
    @Body() dto: UpdateServiceDto,
  ): Promise<ServiceResponseDto> {
    return this.servicesService.update(params.id, dto, auditActorOf(request));
  }

  @Delete('admin/services/:id')
  @RequiresRoles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: AuditedRequest, @Param() params: FhirIdParamDto): Promise<void> {
    await this.servicesService.remove(params.id, auditActorOf(request));
  }
}
