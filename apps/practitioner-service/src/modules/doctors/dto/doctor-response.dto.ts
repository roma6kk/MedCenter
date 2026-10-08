/** API §4.1/4.2 doctor catalog DTO (Practitioner + specialty + room). */
export interface DoctorResponseDto {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly specialty?: string;
  readonly roomId?: string;
}
