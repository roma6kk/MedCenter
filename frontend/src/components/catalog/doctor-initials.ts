import type { Doctor } from './catalog-types';

/** Two initials for the avatar: first letters of first and last name (any alphabet), upper-cased. */
export function doctorInitials(doctor: Pick<Doctor, 'firstName' | 'lastName' | 'name'>): string {
  const letters: ReadonlyArray<string> = [doctor.firstName, doctor.lastName].map((part) => [...part.trim()][0] ?? '');
  const initials: string = letters.join('').toUpperCase();
  return initials === '' ? [...doctor.name.trim()][0]?.toUpperCase() ?? '' : initials;
}
