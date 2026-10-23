import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** API §7.3 — one referral/procedure order, stored as `ServiceRequest` (BR-005). */
export class ServiceRequestDto {
  /** НСИ ЦИСЗ CodeSystem canonical (ADR-002), e.g. `https://fhir.by/CodeSystem/nsi-services`. */
  @ApiProperty({ description: 'НСИ ЦИСЗ CodeSystem canonical', example: 'https://fhir.by/CodeSystem/nsi-services', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  codeSystem!: string;

  @ApiProperty({ maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
