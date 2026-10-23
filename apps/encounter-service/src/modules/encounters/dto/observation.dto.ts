import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';

/** API §7.3 — one measurement, stored as `Observation` with a UCUM `valueQuantity` (BR-009). */
export class ObservationDto {
  /** НСИ CodeSystem canonical, e.g. `https://fhir.by/CodeSystem/nsi-observations`. */
  @ApiProperty({ description: 'НСИ CodeSystem canonical', example: 'https://fhir.by/CodeSystem/nsi-observations', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  codeSystem!: string;

  @ApiProperty({ example: '50849', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: 36.6, minimum: -50, maximum: 300 })
  @IsNumber()
  @Min(-50)
  @Max(300)
  value!: number;

  /** UCUM code (canonical `http://unitsofmeasure.org`), e.g. `Cel`. */
  @ApiProperty({ description: 'UCUM unit (http://unitsofmeasure.org)', example: 'Cel', maxLength: 20 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  unit!: string;
}
