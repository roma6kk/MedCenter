import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** API §5.1.3 `CreateServiceDto` → FHIR `HealthcareService`. */
export class CreateServiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  /** Canonical НСИ ЦИСЗ code system (ADR-002), e.g. `https://fhir.by/CodeSystem/nsi-services`. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  typeSystem!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  typeCode!: string;

  @IsInt()
  @Min(5)
  @Max(240)
  defaultDurationMin!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @IsString({ each: true })
  specialtyCodes?: string[];
}
