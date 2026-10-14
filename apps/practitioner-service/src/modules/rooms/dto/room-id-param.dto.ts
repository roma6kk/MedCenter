import { Matches } from 'class-validator';

import { FHIR_ID_PATTERN } from '../../../common/fhir-id';

/**
 * `{id}` of `/api/v1/admin/rooms/{id}` — a `Location` id. Restricted to the FHIR
 * id grammar: a comma would turn `actor=Location/{id}` into an OR over other rooms.
 */
export class RoomIdParamDto {
  @Matches(FHIR_ID_PATTERN, { message: 'id must be a FHIR resource id' })
  id!: string;
}
