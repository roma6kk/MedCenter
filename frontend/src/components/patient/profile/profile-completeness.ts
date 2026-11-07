import type { AccountProfile, PatientProfile } from '../patient-types';

export type CompletenessItem = 'birthDate' | 'gender' | 'phone' | 'email';

const ITEMS: ReadonlyArray<CompletenessItem> = ['birthDate', 'gender', 'phone', 'email'];

export interface Completeness {
  readonly score: number;
  readonly missing: ReadonlyArray<CompletenessItem>;
}

function contactOf(patient: PatientProfile | null | undefined, system: string): string | undefined {
  return patient?.telecom.find((contact) => contact.system === system && contact.value.trim() !== '')?.value;
}

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

export function computeCompleteness(patient: PatientProfile | null | undefined, account: AccountProfile | null | undefined): Completeness {
  const missing: CompletenessItem[] = ITEMS.filter((item) => !isFilled(item, patient, account));
  return { score: Math.round(((ITEMS.length - missing.length) / ITEMS.length) * 100), missing };
}
