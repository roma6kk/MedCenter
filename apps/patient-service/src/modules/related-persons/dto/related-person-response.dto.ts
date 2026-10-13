import type {
  AdministrativeGender,
  CodingDto,
  ContactPointDto,
  PersonNameDto,
} from '../../../shared/fhir-datatypes.mapper';

/** Trusted person of a patient (API §3.3) — projection of an R4 `RelatedPerson`. */
export interface RelatedPersonResponseDto extends PersonNameDto {
  readonly id: string;
  /** Bare id of `RelatedPerson.patient`. */
  readonly patientId: string;
  readonly active: boolean;
  /** `RelatedPerson.relationship` (v3 RoleCode / v2-0131), `display` prefers the concept text. */
  readonly relationship: ReadonlyArray<CodingDto>;
  readonly gender?: AdministrativeGender;
  readonly birthDate?: string;
  readonly telecom: ReadonlyArray<ContactPointDto>;
}
