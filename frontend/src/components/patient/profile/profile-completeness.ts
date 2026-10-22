/**
 * profile-completeness — how complete the patient's card is, from the fields the API really sends (`PatientProfile`,
 * `AccountProfile`). Pure: no hooks, no clock.
 */
import type { AccountProfile, PatientProfile } from '../patient-types';

export type CompletenessItem = 'birthDate' | 'gender' | 'phone' | 'email';

/** Every item weighs the same, so the ring moves in 25 % steps and each missing item is worth the same effort. */
const ITEMS: ReadonlyArray<CompletenessItem> = ['birthDate', 'gender', 'phone', 'email'];

export interface Completeness {
  /** Whole percent, 0…100. */
  readonly score: number;
  /** In the order of the card; empty when the profile is complete. */
  readonly missing: ReadonlyArray<CompletenessItem>;
}

function contactOf(patient: PatientProfile | null | undefined, system: string): string | undefined {
  return patient?.telecom.find((contact) => contact.system === system && contact.value.trim() !== '')?.value;
}

/** The first phone contact of the card, `undefined` when there is none (an empty value is no phone). */
export function phoneOf(patient: PatientProfile | null | undefined): string | undefined {
  return contactOf(patient, 'phone');
}

function isFilled(item: CompletenessItem, patient: PatientProfile | null | undefined, account: AccountProfile | null | undefined): boolean {
  switch (item) {
    case 'birthDate':
      return (patient?.birthDate ?? '').trim() !== '';
    case 'gender':
      return patient?.gender === 'male' || patient?.gender === 'female' || patient?.gender === 'other';
    case 'phone':
      return phoneOf(patient) !== undefined;
    case 'email':
      return (account?.email ?? '').trim() !== '' || contactOf(patient, 'email') !== undefined;
  }
}

/** A patient without a FHIR card (404) or with a failed read passes `null`: everything the card would hold counts as missing. */
export function computeCompleteness(patient: PatientProfile | null | undefined, account: AccountProfile | null | undefined): Completeness {
  const missing: CompletenessItem[] = ITEMS.filter((item) => !isFilled(item, patient, account));
  return { score: Math.round(((ITEMS.length - missing.length) / ITEMS.length) * 100), missing };
}
