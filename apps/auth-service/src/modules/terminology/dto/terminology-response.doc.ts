import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PageMetaDoc } from '../../users/dto/page-meta.doc';
import type {
  ConceptDto,
  ExpansionResponseDto,
  ValidationResponseDto,
  ValueSetSummaryDto,
} from './terminology-response.dto';

/** OpenAPI description of `ValueSetSummaryDto`. */
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

/** Page of ValueSets (API 2.3.1). */
export class ValueSetPageDoc {
  @ApiProperty({ type: [ValueSetSummaryDoc] })
  items!: ValueSetSummaryDoc[];

  @ApiProperty({ type: PageMetaDoc })
  meta!: PageMetaDoc;
}

/** An expanded concept (R4 `ValueSet.expansion.contains`). */
export class ConceptDoc implements ConceptDto {
  @ApiProperty({ example: 'https://fhir.by/CodeSystem/InternClassificDiseases10' })
  system!: string;

  @ApiProperty({ example: 'J06.9' })
  code!: string;

  @ApiPropertyOptional({ example: 'Acute upper respiratory infection, unspecified' })
  display?: string;
}

/** A page of an expansion (API 2.3.2). */
export class ExpansionResponseDoc implements ExpansionResponseDto {
  @ApiProperty({ example: 'https://fhir.by/ValueSet/atc' })
  valueSet!: string;

  @ApiProperty({ description: 'Size of the whole (filtered) ValueSet' })
  total!: number;

  @ApiProperty({ type: [ConceptDoc] })
  items!: ConceptDoc[];
}

/** Result of a `system|code` check (API 2.3.3). */
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
