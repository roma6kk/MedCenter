import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '@medcenter/common';
import { FHIR_BY } from '@medcenter/terminology';

export class ServiceRequestDto {
  @ApiProperty({ description: 'НСИ ЦИСЗ CodeSystem canonical', enum: [FHIR_BY.SERVICE_CODE_SYSTEM], example: FHIR_BY.SERVICE_CODE_SYSTEM })
  @IsIn([FHIR_BY.SERVICE_CODE_SYSTEM])
  codeSystem!: string;

  @ApiProperty({ maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}
