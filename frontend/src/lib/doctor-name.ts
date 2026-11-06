export interface DoctorNameParts {
  readonly lastName?: string | undefined;
  readonly firstName?: string | undefined;
  readonly middleName?: string | undefined;
}

const SPACES = /\s+/g;

export function normalizeDoctorName(name: string | null | undefined): string {
  return (name ?? '').replace(SPACES, ' ').trim();
}

export function formatDoctorName({ lastName, firstName, middleName }: DoctorNameParts): string {
  return normalizeDoctorName([lastName, firstName, middleName].filter((part) => (part ?? '').trim() !== '').join(' '));
}

export function doctorLabel(doctor: DoctorNameParts & { readonly name: string }): string {
  const fromParts: string = formatDoctorName(doctor);
  return fromParts === '' ? normalizeDoctorName(doctor.name) : fromParts;
}
