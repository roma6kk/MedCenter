/** cabinet-fixtures — realistic answers of the patient's read endpoints for the specs (never imported by application code). */
import type { AccountProfile, HistoryEntry, MedicationPrescription, PatientProfile, ServicePrescription } from './patient-types';

export function historyFixture(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'enc-1',
    date: '2026-10-12T06:00:00.000Z',
    endDate: '2026-10-12T06:30:00.000Z',
    status: 'finished',
    diagnosis: 'J06.9',
    diagnoses: [{ code: 'J06.9', display: 'Острая инфекция верхних дыхательных путей неуточнённая', verificationStatus: 'confirmed' }],
    summary: 'Жалобы на кашель и температуру 37,5.',
    recommendations: 'Обильное питьё, покой.',
    serviceType: { system: 'https://fhir.by/CodeSystem/nsi-services', code: 'S-1', display: 'Приём терапевта (первичный)' },
    appointmentId: '1552',
    practitionerRoleId: 'role-1',
    ...overrides,
  };
}

export function medicationFixture(overrides: Partial<MedicationPrescription> = {}): MedicationPrescription {
  return { id: 'med-1', kind: 'medication', status: 'active', authoredOn: '2026-10-12T06:20:00.000Z', atcCode: 'J01FA10', atcDisplay: 'Азитромицин', dosageText: '1 таб 3 раза в день после еды', note: 'Курс 5 дней', encounterId: 'enc-1', ...overrides };
}

export function serviceFixture(overrides: Partial<ServicePrescription> = {}): ServicePrescription {
  return { id: 'srv-1', kind: 'service', status: 'completed', authoredOn: '2026-10-12T06:25:00.000Z', codeSystem: 'https://fhir.by/CodeSystem/nsi-services', code: 'LAB-101', display: 'Общий анализ крови', encounterId: 'enc-1', ...overrides };
}

export function accountFixture(overrides: Partial<AccountProfile> = {}): AccountProfile {
  return { id: 'user-1', email: 'patient.lebedeva@medcenter.test', firstName: 'Анна', lastName: 'Лебедева', name: 'Лебедева Анна', isActive: true, createdAt: '2026-10-15T05:53:00.667Z', ...overrides };
}

export function patientProfileFixture(overrides: Partial<PatientProfile> = {}): PatientProfile {
  return {
    id: '1442',
    version: '3',
    active: true,
    fullName: 'Лебедева Анна',
    lastName: 'Лебедева',
    firstName: 'Анна',
    birthDate: '1992-11-02',
    gender: 'female',
    telecom: [{ system: 'email', value: 'patient.lebedeva@medcenter.test', use: 'home' }, { system: 'phone', value: '+375291234567', use: 'mobile' }],
    ...overrides,
  };
}

/** What a patient can type into a free-text field: 500 characters and not one place to break the line. */
export const LONG_UNBROKEN_TEXT: string = 'W'.repeat(500);
