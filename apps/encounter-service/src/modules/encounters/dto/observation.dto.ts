import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';
import { FHIR_BY } from '@medcenter/terminology';

export class ObservationDto {
  @ApiProperty({ description: 'НСИ CodeSystem canonical', enum: [FHIR_BY.OBSERVATION_CODE_SYSTEM], example: FHIR_BY.OBSERVATION_CODE_SYSTEM })
  @IsIn([FHIR_BY.OBSERVATION_CODE_SYSTEM])
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

  @ApiProperty({ description: 'UCUM unit (http://unitsofmeasure.org)', example: 'Cel', maxLength: 20 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  unit!: string;
}
