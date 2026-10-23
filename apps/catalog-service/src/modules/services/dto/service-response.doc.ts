import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PageMetaDoc } from '../../../common/page-meta.doc';
import type { ServiceResponseDto } from './service-response.dto';

/** Documentation class of `ServiceResponseDto` (API §5.1): the interface cannot be reflected by Swagger. */
export class ServiceResponseDoc implements ServiceResponseDto {
  @ApiProperty({ description: 'HealthcareService id (FHIR id)', example: '1044' })
  id!: string;

  @ApiProperty({ example: 'Консультация терапевта' })
  name!: string;

  @ApiProperty({
    description: 'Canonical code system of the НСИ service type',
    example: 'https://fhir.by/CodeSystem/nsi-services',
  })
  typeSystem!: string;

  @ApiProperty({ example: '01.001' })
  typeCode!: string;

  @ApiProperty({
    description: 'Display text of the НСИ code',
    example: 'Консультация врача-терапевта',
  })
  typeDisplay!: string;

  @ApiProperty({ minimum: 5, maximum: 240, example: 30 })
  defaultDurationMin!: number;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ description: 'false for a service taken out of the catalogue' })
  isActive!: boolean;
}

/** `PaginatedResponseDto<ServiceResponseDto>` (API §0, §5.1.1). */
export class ServicePageDoc {
  @ApiProperty({ type: [ServiceResponseDoc] })
  items!: ServiceResponseDoc[];

  @ApiProperty({ type: PageMetaDoc })
  meta!: PageMetaDoc;
}
