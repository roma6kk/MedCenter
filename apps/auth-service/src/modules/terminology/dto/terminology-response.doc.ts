import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PageMetaDoc } from '../../users/dto/page-meta.doc';
import type {
  ConceptDto,
  ExpansionResponseDto,
  ValidationResponseDto,
  ValueSetSummaryDto,
} from './terminology-response.dto';

export class ValueSetSummaryDoc implements ValueSetSummaryDto {
  @ApiProperty({ example: 'https://fhir.by/ValueSet/atc', description: 'Canonical https://fhir.by/ValueSet/...' })
  url!: string;

  @ApiPropertyOptional({ example: 'atc' })
  name?: string;

  @ApiPropertyOptional({ example: 'ATC' })
  title?: string;

  @ApiPropertyOptional({ example: '1.4.463' })
  version?: string;

  @ApiPropertyOptional({ example: 'active' })
  status?: string;
}

export class ValueSetPageDoc {
  @ApiProperty({ type: [ValueSetSummaryDoc] })
  items!: ValueSetSummaryDoc[];

  @ApiProperty({ type: PageMetaDoc })
  meta!: PageMetaDoc;
}

export class ConceptDoc implements ConceptDto {
  @ApiProperty({ example: 'https://fhir.by/CodeSystem/InternClassificDiseases10' })
  system!: string;

  @ApiProperty({ example: 'J06.9' })
  code!: string;

  @ApiPropertyOptional({ example: 'Acute upper respiratory infection, unspecified' })
  display?: string;
}

export class ExpansionResponseDoc implements ExpansionResponseDto {
  @ApiProperty({ example: 'https://fhir.by/ValueSet/atc' })
  valueSet!: string;

  @ApiProperty({ description: 'Size of the whole (filtered) ValueSet' })
  total!: number;

  @ApiProperty({ type: [ConceptDoc] })
  items!: ConceptDoc[];
}

export class ValidationResponseDoc implements ValidationResponseDto {
  @ApiProperty()
  system!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty({ description: 'Whether the code is in the seeded ValueSet of its system' })
  valid!: boolean;

  @ApiPropertyOptional()
  display?: string;
}
