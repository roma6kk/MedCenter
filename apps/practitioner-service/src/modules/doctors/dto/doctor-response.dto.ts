/** API §4.1/4.2 doctor catalog DTO (Practitioner + specialty + room + roles). */
export interface DoctorResponseDto {
  readonly id: string;
  /** Display name: given + family. A client that writes «Фамилия Имя Отчество» builds it from `lastName`, `firstName` and `middleName`. */
  readonly name: string;
  readonly firstName: string;
  readonly lastName: string;
  /** Patronymic (the second given name); absent when the doctor has none. */
  readonly middleName?: string;
  /** Display text of the specialty. */
  readonly specialty?: string;
  /** Code of the specialty: the value `?specialty=` of `GET /doctors` takes (with {@link specialtySystem}: `system|code`). */
  readonly specialtyCode?: string;
  readonly specialtySystem?: string;
  readonly roomId?: string;
  /**
   * Ids of the doctor's active `PractitionerRole`s, ascending; empty when there is none. A DOCTOR account is
   * linked to one of them (`practitionerRoleId` of API §2.2).
   */
  readonly practitionerRoleIds: readonly string[];
}
