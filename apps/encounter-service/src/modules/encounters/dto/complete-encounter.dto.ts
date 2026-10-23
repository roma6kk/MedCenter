import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { EmergencyReason } from './emergency-reason.decorator';
import { ConditionDto } from './condition.dto';
import { MedicationRequestDto } from './medication-request.dto';
import { ObservationDto } from './observation.dto';
import { ServiceRequestDto } from './service-request.dto';

/**
 * API §7.3 — one body, one atomic completion of the encounter (FR-011…FR-014).
 * The first diagnosis is the primary one: every prescription references it (BR-005).
 */
export class CompleteEncounterDto {
  /** `ClinicalImpression.summary`. */
  @ApiProperty({ description: 'ClinicalImpression.summary', minLength: 3, maxLength: 4000 })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(4000)
  summary!: string;

  /** `Condition[]` (category=encounter-diagnosis, BR-004). */
  @ApiProperty({ type: [ConditionDto], minItems: 1, maxItems: 20, description: 'The first diagnosis is the primary one' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ConditionDto)
  diagnoses!: ConditionDto[];

  /** `CarePlan.description` (FR-013). */
  @ApiProperty({ description: 'CarePlan.description', minLength: 3, maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(2000)
  recommendations!: string;

  @ApiPropertyOptional({ type: [ObservationDto], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ObservationDto)
  observations?: ObservationDto[];

  @ApiPropertyOptional({ type: [ServiceRequestDto], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ServiceRequestDto)
  serviceRequests?: ServiceRequestDto[];

  @ApiPropertyOptional({ type: [MedicationRequestDto], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MedicationRequestDto)
  medicationRequests?: MedicationRequestDto[];

  /** ADR-019: completes without a patient consent and journals the reason. */
  @ApiPropertyOptional({ description: 'Completes without the patient consent (ADR-019); the reason is journalled', minLength: 10, maxLength: 500 })
  @IsOptional()
  @EmergencyReason()
  emergencyReason?: string;
}
