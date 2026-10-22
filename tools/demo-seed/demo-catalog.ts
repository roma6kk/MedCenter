/**
 * The clinic's reference data as plain definitions (no FHIR here — see
 * `demo-resources.ts` for the R4 builders). Everything is keyed by a stable
 * business key; `seedResourceId(<ResourceType>, key)` turns a key into the
 * deterministic FHIR id, which is what makes the seed idempotent.
 *
 * Working hours are the clinic's wall-clock time (Europe/Minsk, API §5.2.1).
 * They are stored in the schedule as they are; only the slot instants are UTC.
 */

export type DayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface SpecialtyDef {
  readonly key: string;
  /** SNOMED CT specialty (qualifier value) — the system `PractitionerRole.specialty` uses across the services. */
  readonly code: string;
  readonly display: string;
  /** Doctor's profession as shown in the catalog (`Practitioner.qualification[0].code.text`). */
  readonly profession: string;
}

export interface RoomDef {
  readonly key: string;
  readonly identifier: string;
  readonly name: string;
  readonly floor: number;
  readonly description: string;
}

export interface ServiceDef {
  readonly key: string;
  readonly name: string;
  /** Code of `https://fhir.by/CodeSystem/nsi-services`; must exist in the terminology snapshot. */
  readonly typeCode: string;
  readonly durationMin: number;
  readonly description: string;
}

export interface DoctorDef {
  readonly key: string;
  readonly family: string;
  readonly given: string;
  readonly patronymic: string;
  readonly gender: 'male' | 'female';
  readonly specialtyKey: string;
  /** Local part of the demo login (`<emailLocal>@<demo domain>`). */
  readonly emailLocal: string;
}

export interface ScheduleDef {
  readonly key: string;
  readonly doctorKey: string;
  readonly serviceKey: string;
  readonly roomKey: string;
  readonly days: readonly DayCode[];
  /** Clinic wall-clock `HH:mm`. */
  readonly localStart: string;
  readonly localEnd: string;
  readonly slotDurationMin: number;
}

export interface PatientDef {
  readonly emailLocal: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: string;
  readonly gender: 'male' | 'female';
}

export interface AdminDef {
  readonly emailLocal: string;
  readonly firstName: string;
  readonly lastName: string;
}

/**
 * Demo portraits are static files of the web app (`frontend/public/demo-photos`), so the
 * FHIR `photo.url` is a same-origin path the browser can load under the CSP (`img-src 'self'`).
 */
const PHOTO_ROOT = '/demo-photos';

export function doctorPhotoUrl(doctor: Pick<DoctorDef, 'key'>): string {
  return `${PHOTO_ROOT}/doctors/${doctor.key}.jpg`;
}

/** `patient.kuznetsov` → `/demo-photos/patients/kuznetsov.jpg`. */
export function patientPhotoUrl(patient: Pick<PatientDef, 'emailLocal'>): string {
  return `${PHOTO_ROOT}/patients/${patient.emailLocal.replace(/^patient\./, '')}.jpg`;
}

export const CLINIC = {
  key: 'medcenter',
  name: 'Лайфлайн',
  alias: 'Лайфлайн — медицинский центр',
  phone: '+375 17 000-00-00',
  email: 'info@lifeline.example',
  addressLine: 'ул. Свободы, 1',
  city: 'Минск',
  postalCode: '220000',
  country: 'BY',
} as const;

const WEEKDAYS: readonly DayCode[] = ['MO', 'TU', 'WE', 'TH', 'FR'];

export const SPECIALTIES: readonly SpecialtyDef[] = [
  { key: 'therapy', code: '419192003', display: 'Терапия', profession: 'Терапевт' },
  { key: 'cardiology', code: '394579002', display: 'Кардиология', profession: 'Кардиолог' },
  { key: 'neurology', code: '394591006', display: 'Неврология', profession: 'Невролог' },
  { key: 'surgery', code: '394609007', display: 'Хирургия', profession: 'Хирург' },
];

export const ROOMS: readonly RoomDef[] = [
  { key: 'room-101', identifier: '101', name: 'Кабинет 101', floor: 1, description: 'Кабинет терапевта' },
  { key: 'room-112', identifier: '112', name: 'Кабинет 112', floor: 1, description: 'Хирургический кабинет' },
  { key: 'room-204', identifier: '204', name: 'Кабинет 204', floor: 2, description: 'Кабинет кардиолога' },
  { key: 'room-210', identifier: '210', name: 'Кабинет 210', floor: 2, description: 'Кабинет функциональной диагностики' },
  { key: 'room-305', identifier: '305', name: 'Кабинет 305', floor: 3, description: 'Кабинет невролога' },
];

export const SERVICES: readonly ServiceDef[] = [
  { key: 'ter-primary', name: 'Приём терапевта (первичный)', typeCode: '10001', durationMin: 30, description: 'Первичная консультация терапевта' },
  { key: 'ter-repeat', name: 'Приём терапевта (повторный)', typeCode: '10002', durationMin: 20, description: 'Повторная консультация терапевта' },
  { key: 'card-primary', name: 'Приём кардиолога (первичный)', typeCode: '10003', durationMin: 40, description: 'Первичная консультация кардиолога' },
  { key: 'neuro-primary', name: 'Приём невролога (первичный)', typeCode: '10004', durationMin: 40, description: 'Первичная консультация невролога' },
  { key: 'surg-primary', name: 'Приём хирурга (первичный)', typeCode: '10005', durationMin: 30, description: 'Первичная консультация врача-хирурга' },
  { key: 'ecg', name: 'Электрокардиография (ЭКГ)', typeCode: '10007', durationMin: 20, description: 'ЭКГ в покое с расшифровкой' },
];

export const DOCTORS: readonly DoctorDef[] = [
  { key: 'ivanova', family: 'Иванова', given: 'Мария', patronymic: 'Сергеевна', gender: 'female', specialtyKey: 'therapy', emailLocal: 'doctor.ivanova' },
  { key: 'petrov', family: 'Петров', given: 'Алексей', patronymic: 'Николаевич', gender: 'male', specialtyKey: 'cardiology', emailLocal: 'doctor.petrov' },
  { key: 'sidorova', family: 'Сидорова', given: 'Елена', patronymic: 'Викторовна', gender: 'female', specialtyKey: 'neurology', emailLocal: 'doctor.sidorova' },
  { key: 'kozlov', family: 'Козлов', given: 'Дмитрий', patronymic: 'Андреевич', gender: 'male', specialtyKey: 'surgery', emailLocal: 'doctor.kozlov' },
];

/**
 * One Schedule = one (PractitionerRole, room, service). Schedules of the same
 * role must not overlap (BR-007 / `SCHEDULE_OVERLAP`): the therapist's two are
 * split into morning/afternoon, the cardiologist's by weekday.
 */
export const SCHEDULES: readonly ScheduleDef[] = [
  { key: 'ivanova-primary', doctorKey: 'ivanova', serviceKey: 'ter-primary', roomKey: 'room-101', days: WEEKDAYS, localStart: '09:00', localEnd: '13:00', slotDurationMin: 30 },
  { key: 'ivanova-repeat', doctorKey: 'ivanova', serviceKey: 'ter-repeat', roomKey: 'room-101', days: WEEKDAYS, localStart: '14:00', localEnd: '17:00', slotDurationMin: 20 },
  { key: 'petrov-primary', doctorKey: 'petrov', serviceKey: 'card-primary', roomKey: 'room-204', days: ['MO', 'WE', 'FR'], localStart: '10:00', localEnd: '14:00', slotDurationMin: 40 },
  { key: 'petrov-ecg', doctorKey: 'petrov', serviceKey: 'ecg', roomKey: 'room-210', days: ['TU', 'TH'], localStart: '10:00', localEnd: '13:00', slotDurationMin: 20 },
  { key: 'sidorova-primary', doctorKey: 'sidorova', serviceKey: 'neuro-primary', roomKey: 'room-305', days: WEEKDAYS, localStart: '10:00', localEnd: '16:00', slotDurationMin: 40 },
  { key: 'kozlov-primary', doctorKey: 'kozlov', serviceKey: 'surg-primary', roomKey: 'room-112', days: ['TU', 'WE', 'TH'], localStart: '09:00', localEnd: '15:00', slotDurationMin: 30 },
];

export const PATIENTS: readonly PatientDef[] = [
  { emailLocal: 'patient.kuznetsov', firstName: 'Павел', lastName: 'Кузнецов', birthDate: '1985-03-14', gender: 'male' },
  { emailLocal: 'patient.lebedeva', firstName: 'Анна', lastName: 'Лебедева', birthDate: '1992-11-02', gender: 'female' },
  { emailLocal: 'patient.novikov', firstName: 'Сергей', lastName: 'Новиков', birthDate: '1978-07-21', gender: 'male' },
];

/** Demo administrators created by the users step; the bootstrap admin (from `.env`) is separate. */
export const ADMINS: readonly AdminDef[] = [{ emailLocal: 'admin.demo', firstName: 'Демо', lastName: 'Администратор' }];

/** Belarus abolished DST in 2011: Europe/Minsk is UTC+3 all year (same fixed offset as catalog-service `clinic-calendar.ts`). */
export const CLINIC_UTC_OFFSET_MINUTES = 180;

/** Planning horizon of the seeded slots. */
export const DEFAULT_SLOT_DAYS = 14;
