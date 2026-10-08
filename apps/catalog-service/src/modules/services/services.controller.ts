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
import { Public, RequiresRoles } from '@medcenter/common';
import { Role } from '@medcenter/contracts';

import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import type { ServiceResponseDto } from './dto/service-response.dto';
import { ServicesService } from './services.service';

/** API §5.1. Public reads; admin writes carry `ADMIN` (BR-007). */
@Controller('api/v1')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Public()
  @Get('services')
  async list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('search') search?: string,
  ): Promise<ServiceResponseDto[]> {
    return this.servicesService.list(Number(page), Number(pageSize), search);
  }

  @Public()
  @Get('services/:id')
  async findById(@Param('id') id: string): Promise<ServiceResponseDto> {
    return this.servicesService.findById(id);
  }

  @Post('admin/services')
  @RequiresRoles(Role.ADMIN)
  async create(@Body() dto: CreateServiceDto): Promise<ServiceResponseDto> {
    return this.servicesService.create(dto);
  }

  @Patch('admin/services/:id')
  @RequiresRoles(Role.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ): Promise<ServiceResponseDto> {
    return this.servicesService.update(id, dto);
  }

  @Delete('admin/services/:id')
  @RequiresRoles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.servicesService.remove(id);
  }
}
