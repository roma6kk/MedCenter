export type MedcardTab = 'history' | 'prescriptions';

/** `?tab=prescriptions` opens the prescriptions; anything else (nothing, a typo, an array) opens the history. */
export function parseMedcardTab(value: string | undefined): MedcardTab {
  return value === 'prescriptions' ? 'prescriptions' : 'history';
}
