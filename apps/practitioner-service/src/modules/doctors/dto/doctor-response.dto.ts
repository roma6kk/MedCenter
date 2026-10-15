/** API §4.1/4.2 doctor catalog DTO (Practitioner + specialty + room). */
export interface DoctorResponseDto {
  readonly id: string;
  /** Display name: given + family (the client renders this one). */
  readonly name: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly specialty?: string;
  readonly roomId?: string;
}
