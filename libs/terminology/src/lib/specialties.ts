export interface SpecialtyDef {
  readonly key: string;
  readonly code: string;
  readonly display: string;
  readonly displayEn: string;
  readonly profession: string;
  readonly professionEn: string;
}

/** SNOMED CT codes of the clinic's specialties: the demo seed and the admin's "create a doctor" use the same list. */
export const SPECIALTIES: readonly SpecialtyDef[] = [
  { key: 'therapy', code: '419192003', display: 'Терапия', displayEn: 'Therapy', profession: 'Терапевт', professionEn: 'Therapist' },
  { key: 'cardiology', code: '394579002', display: 'Кардиология', displayEn: 'Cardiology', profession: 'Кардиолог', professionEn: 'Cardiologist' },
  { key: 'neurology', code: '394591006', display: 'Неврология', displayEn: 'Neurology', profession: 'Невролог', professionEn: 'Neurologist' },
  { key: 'surgery', code: '394609007', display: 'Хирургия', displayEn: 'Surgery', profession: 'Хирург', professionEn: 'Surgeon' },
];
