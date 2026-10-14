import { Matches } from 'class-validator';

import { FHIR_ID_PATTERN } from '../../../common/fhir-id';

/**
 * `{id}` of `GET /api/v1/doctors/{id}/slots` — the **Practitioner** id, the same
 * id space as the doctor catalog (API §4.1/§4.2) the frontend links from.
 * Restricted to the FHIR id grammar (`FHIR_ID_PATTERN`): a comma would turn the
 * reference search into an OR over other practitioners, and a dots-only id
 * would collapse the FHIR read URL.
 */
export class DoctorIdParamDto {
  @Matches(FHIR_ID_PATTERN, { message: 'id must be a FHIR resource id' })
  id!: string;
}
