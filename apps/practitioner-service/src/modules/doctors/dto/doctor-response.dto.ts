export interface DoctorResponseDto {
  readonly id: string;
  readonly name: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly middleName?: string;
  readonly specialty?: string;
  readonly specialtyCode?: string;
  readonly specialtySystem?: string;
  readonly roomId?: string;
  readonly practitionerRoleIds: readonly string[];
}
