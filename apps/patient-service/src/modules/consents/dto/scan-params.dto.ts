import { Matches } from 'class-validator';

import { FHIR_ID_PATTERN } from '../../access/patient-identity';

/** `:id` and `:scanId` of `/api/v1/patients/{id}/consent/scan/{scanId}` — both FHIR R4 ids. */
export class ScanParamsDto {
  @Matches(FHIR_ID_PATTERN, { message: 'id must be a FHIR resource id ([A-Za-z0-9-.]{1,64})' })
  readonly id!: string;

  @Matches(FHIR_ID_PATTERN, { message: 'scanId must be a FHIR resource id ([A-Za-z0-9-.]{1,64})' })
  readonly scanId!: string;
}
