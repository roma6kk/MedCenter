import type {
  AdministrativeGender,
  ContactPointDto,
  IdentifierDto,
  PersonNameDto,
} from '../../../shared/fhir-datatypes.mapper';

export interface PatientResponseDto extends PersonNameDto {
  readonly id: string;
  readonly version?: string;
  readonly active: boolean;
  readonly birthDate?: string;
  readonly gender?: AdministrativeGender;
  readonly photoUrl?: string;
  readonly telecom: ReadonlyArray<ContactPointDto>;
  readonly identifiers: ReadonlyArray<IdentifierDto>;
}
