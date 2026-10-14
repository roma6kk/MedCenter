import { IsNotEmpty, IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';

/** API §7.3 — one measurement, stored as `Observation` with a UCUM `valueQuantity` (BR-009). */
export class ObservationDto {
  /** НСИ CodeSystem canonical, e.g. `https://fhir.by/CodeSystem/nsi-observations`. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  codeSystem!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsNumber()
  @Min(-50)
  @Max(300)
  value!: number;

  /** UCUM code (canonical `http://unitsofmeasure.org`), e.g. `Cel`. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  unit!: string;
}
