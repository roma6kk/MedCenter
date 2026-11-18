import type {
  AdministrativeGender,
  CodingDto,
  ContactPointDto,
  PersonNameDto,
} from '../../../shared/fhir-datatypes.mapper';

export interface RelatedPersonResponseDto extends PersonNameDto {
  readonly id: string;
  readonly patientId: string;
  readonly active: boolean;
  readonly relationship: ReadonlyArray<CodingDto>;
  readonly gender?: AdministrativeGender;
  readonly birthDate?: string;
  readonly telecom: ReadonlyArray<ContactPointDto>;
}
