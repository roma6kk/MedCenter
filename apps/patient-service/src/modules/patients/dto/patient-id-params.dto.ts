import { Matches } from 'class-validator';

import { FHIR_ID_PATTERN } from '../../access/patient-identity';

/** `:id` path parameter of `/api/v1/patients/{id}[/related]` — a FHIR R4 `id`. */
export class PatientIdParamsDto {
  @Matches(FHIR_ID_PATTERN, { message: 'id must be a FHIR resource id ([A-Za-z0-9-.]{1,64})' })
  readonly id!: string;
}
