import {
  registerPatientSchema,
  cancelAppointmentSchema,
  toCancelReasonCode,
  completeEncounterSchema,
  ICD10_PATTERN,
  ATC_PATTERN,
  EMAIL_MAX,
  NAME_MAX,
} from './contracts';

const VALID_REGISTER = {
  email: 'ivanov@example.by',
  firstName: 'Иван',
  lastName: 'Иванов',
  password: 'Str0ng!Pass',
  birthDate: '1990-05-12',
  accountConsent: { accepted: true, textVersion: '2026-10' },
} as const;

const VALID_ENCOUNTER = {
  summary: 'ОРВИ, состояние удовлетворительное',
  diagnoses: [{ code: 'J06.9', display: 'Острая инфекция верхних дыхательных путей' }],
} as const;

describe('contracts boundary pipeline', () => {
  describe('registerPatientSchema', () => {
    it('should accept a valid payload', () => {
      expect(registerPatientSchema.safeParse(VALID_REGISTER).success).toBe(true);
    });

    it.each([
      ['no-at-sign.example.by'],
      ['@example.by'],
      ['a@'],
      ['a b@example.by'],
    ])('should reject invalid email %s', (email) => {
      expect(registerPatientSchema.safeParse({ ...VALID_REGISTER, email }).success).toBe(false);
    });

    it('should enforce the EMAIL_MAX boundary', () => {
      const local = 'a'.repeat(EMAIL_MAX - '@example.by'.length);
      expect(registerPatientSchema.safeParse({ ...VALID_REGISTER, email: `${local}@example.by` }).success).toBe(true);
      expect(registerPatientSchema.safeParse({ ...VALID_REGISTER, email: `${local}a@example.by` }).success).toBe(false);
    });

    it('should enforce the NAME_MAX boundary', () => {
      expect(registerPatientSchema.safeParse({ ...VALID_REGISTER, firstName: '' }).success).toBe(false);
      expect(registerPatientSchema.safeParse({ ...VALID_REGISTER, firstName: 'И'.repeat(NAME_MAX) }).success).toBe(true);
      expect(registerPatientSchema.safeParse({ ...VALID_REGISTER, firstName: 'И'.repeat(NAME_MAX + 1) }).success).toBe(false);
    });

    it.each([
      ['short1!A'],
      ['alllowercase1!'],
      ['ALLUPPERCASE1!'],
      ['NoDigitsHere!x'],
      ['NoSpecial123Aa'],
      ['weak'],
    ])('should reject weak password %s', (password) => {
      expect(registerPatientSchema.safeParse({ ...VALID_REGISTER, password }).success).toBe(false);
    });

    it.each([
      ['12-05-1990'],
      ['1990/05/12'],
      ['1990-5-2'],
      ['not-a-date'],
      ['1990-05-12T00:00:00'],
    ])('should reject malformed birthDate %s', (birthDate) => {
      expect(registerPatientSchema.safeParse({ ...VALID_REGISTER, birthDate }).success).toBe(false);
    });
  });

  describe('cancelAppointmentSchema', () => {
    it.each(['plans-changed', 'inconvenient-time', 'other-doctor', 'other'])('should accept the code %s', (reason) => {
      expect(cancelAppointmentSchema.safeParse({ reason }).success).toBe(true);
    });

    it.each(['', 'Заболел', 'illness', 'Plans-Changed'])('should reject %p, so that no free text goes out', (reason) => {
      expect(cancelAppointmentSchema.safeParse({ reason }).success).toBe(false);
    });
  });

  describe('toCancelReasonCode', () => {
    it('should keep a known code and read legacy free text, an unknown code or nothing as other', () => {
      expect(toCancelReasonCode('other-doctor')).toBe('other-doctor');
      expect(toCancelReasonCode('Не смогу прийти')).toBe('other');
      expect(toCancelReasonCode(undefined)).toBe('other');
    });
  });
});
