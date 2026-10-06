import { registerPatientSchema, cancelAppointmentSchema, completeEncounterSchema } from './contracts';

describe('contracts', () => {
  it('should accept a valid patient registration payload', () => {
    const result = registerPatientSchema.safeParse({
      email: 'ivanov@example.by',
      firstName: 'Иван',
      lastName: 'Иванов',
      password: 'Str0ng!Pass',
      birthDate: '1990-05-12',
    });

    expect(result.success).toBe(true);
  });

  it('should reject a weak password', () => {
    const result = registerPatientSchema.safeParse({
      email: 'ivanov@example.by',
      firstName: 'Иван',
      lastName: 'Иванов',
      password: 'weak',
      birthDate: '1990-05-12',
    });

    expect(result.success).toBe(false);
  });

  it('should require a cancellation reason of 3..500 chars', () => {
    expect(cancelAppointmentSchema.safeParse({ reason: 'ok' }).success).toBe(false);
    expect(cancelAppointmentSchema.safeParse({ reason: 'Пациент заболел' }).success).toBe(true);
  });

  it('should require at least one ICD-10 diagnosis to complete an encounter', () => {
    const result = completeEncounterSchema.safeParse({
      summary: 'ОРВИ',
      diagnoses: [{ code: 'J06.9', display: 'Острая респираторная инфекция' }],
    });

    expect(result.success).toBe(true);
  });

  it('should reject an invalid ICD-10 code', () => {
    const result = completeEncounterSchema.safeParse({
      summary: 'ОРВИ',
      diagnoses: [{ code: 'bad', display: 'x' }],
    });

    expect(result.success).toBe(false);
  });
});
