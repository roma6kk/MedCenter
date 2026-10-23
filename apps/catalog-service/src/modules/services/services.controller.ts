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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ApiProblems,
  auditActorOf,
  GUARD_PROBLEM_STATUSES,
  Public,
  RequiresRoles,
  type AuditedRequest,
} from '@medcenter/common';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, Role } from '@medcenter/contracts';

import { FhirIdParamDto } from '../../common/fhir-id-param.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { ListServicesQueryDto } from './dto/list-services-query.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServicePageDoc, ServiceResponseDoc } from './dto/service-response.doc';
import type { ServiceResponseDto } from './dto/service-response.dto';
import { ServicesService, type ServicePage } from './services.service';

/** API §5.1. Public reads; admin writes carry `ADMIN` (BR-007). */
@ApiTags('catalog')
@Controller('api/v1')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Public()
  @Get('services')
  @ApiOperation({ summary: '5.1.1 List the service catalogue' })
  @ApiResponse({ status: 200, description: 'A page of services', type: ServicePageDoc })
  @ApiProblems([400, 429, 500])
  async list(@Query() query: ListServicesQueryDto): Promise<ServicePage> {
    return this.servicesService.list(
      query.page ?? DEFAULT_PAGE,
      query.pageSize ?? DEFAULT_PAGE_SIZE,
      query.search,
    );
  }

  @Public()
  @Get('services/:id')
  @ApiOperation({ summary: '5.1.2 Get a service' })
  @ApiResponse({ status: 200, description: 'The service', type: ServiceResponseDoc })
  @ApiProblems([400, 404, 429, 500])
  async findById(@Param() params: FhirIdParamDto): Promise<ServiceResponseDto> {
    return this.servicesService.findById(params.id);
  }

  @Post('admin/services')
  @RequiresRoles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '5.1.3 Create a service' })
  @ApiResponse({ status: 201, description: 'The created service', type: ServiceResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 422], {
    422: 'TERMINOLOGY_NOT_FOUND: type code or system is not in the НСИ seed',
  })
  async create(
    @Req() request: AuditedRequest,
    @Body() dto: CreateServiceDto,
  ): Promise<ServiceResponseDto> {
    return this.servicesService.create(dto, auditActorOf(request));
  }

  @Patch('admin/services/:id')
  @RequiresRoles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '5.1.4 Update a service' })
  @ApiResponse({ status: 200, description: 'The updated service', type: ServiceResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404, 409, 422], {
    409: 'CONFLICT: the service was changed concurrently (version mismatch)',
    422: 'TERMINOLOGY_NOT_FOUND: type code or system is not in the НСИ seed',
  })
  async update(
    @Req() request: AuditedRequest,
    @Param() params: FhirIdParamDto,
    @Body() dto: UpdateServiceDto,
  ): Promise<ServiceResponseDto> {
    return this.servicesService.update(params.id, dto, auditActorOf(request));
  }

  @Delete('admin/services/:id')
  @RequiresRoles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '5.1.5 Delete a service' })
  @ApiResponse({ status: 204, description: 'The service is deleted' })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404, 409], {
    409: 'SERVICE_IN_USE: a Schedule still references the service',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: AuditedRequest, @Param() params: FhirIdParamDto): Promise<void> {
    await this.servicesService.remove(params.id, auditActorOf(request));
  }
}
