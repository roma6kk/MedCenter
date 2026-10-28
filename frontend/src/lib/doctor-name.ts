/**
 * doctor-name — the one way a doctor's name is written in the patient cabinet: «Фамилия Имя Отчество» when the patronymic
 * is known, else «Фамилия Имя». appointment-service and encounter-service already send the name in that order (`family given…`),
 * the public catalog sends the parts without a patronymic; both go through here so a doctor never changes shape between screens.
 */

export interface DoctorNameParts {
  readonly lastName?: string | undefined;
  readonly firstName?: string | undefined;
  readonly middleName?: string | undefined;
}

const SPACES = /\s+/g;

/** A name that came as one string, tidied (no stray or doubled spaces); `''` for nothing. */
export function normalizeDoctorName(name: string | null | undefined): string {
  return (name ?? '').replace(SPACES, ' ').trim();
}

/** «Фамилия Имя Отчество» from the parts; absent parts are skipped. */
export function formatDoctorName({ lastName, firstName, middleName }: DoctorNameParts): string {
  return normalizeDoctorName([lastName, firstName, middleName].filter((part) => (part ?? '').trim() !== '').join(' '));
}

/** The catalog doctor: the parts when it has them, else its ready-made `name` («Имя Фамилия» is never shown). */
export function doctorLabel(doctor: DoctorNameParts & { readonly name: string }): string {
  const fromParts: string = formatDoctorName(doctor);
  return fromParts === '' ? normalizeDoctorName(doctor.name) : fromParts;
}
