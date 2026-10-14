import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** API §7.3 — one referral/procedure order, stored as `ServiceRequest` (BR-005). */
export class ServiceRequestDto {
  /** НСИ ЦИСЗ CodeSystem canonical (ADR-002), e.g. `https://fhir.by/CodeSystem/nsi-services`. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  codeSystem!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
