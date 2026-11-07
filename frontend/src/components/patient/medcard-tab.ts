export type MedcardTab = 'history' | 'prescriptions';

export function parseMedcardTab(value: string | undefined): MedcardTab {
  return value === 'prescriptions' ? 'prescriptions' : 'history';
}
