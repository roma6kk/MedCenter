import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { FHIR_ID_PATTERN } from '@medcenter/common';

// FHIR id grammar only: a comma would turn `actor=Location/{id}` into an OR over other rooms.
export class RoomIdParamDto {
  @ApiProperty({ description: 'Location id of the room (FHIR id)', pattern: '^[A-Za-z0-9\\-.]{1,64}$' })
  @Matches(FHIR_ID_PATTERN, { message: 'id must be a FHIR resource id' })
  id!: string;
}
