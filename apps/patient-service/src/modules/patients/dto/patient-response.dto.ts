import type {
  AdministrativeGender,
  ContactPointDto,
  IdentifierDto,
  PersonNameDto,
} from '../../../shared/fhir-datatypes.mapper';

/**
 * Patient card (API §3.1–3.2) — the BFF projection of an R4 `Patient`
 * (`FhirToXMapper`, see `../mappers/patient.mapper.ts`). Optional fields are
 * omitted, not `null`, when the Patient does not carry them.
 */
export interface PatientResponseDto extends PersonNameDto {
  readonly id: string;
  /** `Patient.meta.versionId`: the value a client sends back as `If-Match` (API §3.12, ADR-012). */
  readonly version?: string;
  /** `Patient.active`; an absent value means the record is in use. */
  readonly active: boolean;
  /** `Patient.birthDate`, FHIR `date` (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`). */
  readonly birthDate?: string;
  readonly gender?: AdministrativeGender;
  /** `Patient.photo[0].url` (an `Attachment` carrying inline `data` only is not exposed). */
  readonly photoUrl?: string;
  readonly telecom: ReadonlyArray<ContactPointDto>;
  readonly identifiers: ReadonlyArray<IdentifierDto>;
}
