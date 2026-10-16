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
      summary: 'ОРВИ, состояние удовлетворительное',
      diagnoses: [{ code: 'J06.9', display: 'Острая респираторная инфекция' }],
      recommendations: 'Покой, обильное питьё, контроль температуры',
    });

    expect(result.success).toBe(true);
  });

  it('should reject an invalid ICD-10 code', () => {
    const result = completeEncounterSchema.safeParse({
      summary: 'ОРВИ, состояние удовлетворительное',
      diagnoses: [{ code: 'bad', display: 'x' }],
      recommendations: 'Покой, обильное питьё, контроль температуры',
    });

    expect(result.success).toBe(false);
  });

  it('should accept structured observations with UCUM units', () => {
    const result = completeEncounterSchema.safeParse({
      summary: 'ОРВИ, состояние удовлетворительное',
      diagnoses: [{ code: 'J06.9', display: 'Острая респираторная инфекция', verificationStatus: 'confirmed' }],
      recommendations: 'Покой, обильное питьё, контроль температуры',
      observations: [
        {
          codeSystem: 'https://fhir.by/CodeSystem/nsi-observations',
          code: '8480-6',
          value: 36.6,
          unit: 'Cel',
        },
      ],
      serviceRequests: [
        { codeSystem: 'https://fhir.by/CodeSystem/nsi-services', code: 'SRV-1', note: 'Натощак' },
      ],
      medicationRequests: [{ atcCode: 'N02BE01', dosageText: '1 таб 3 раза в день после еды' }],
    });

    expect(result.success).toBe(true);
  });
});

describe('registerPatientSchema password policy parity with class-validator IsStrongPassword', () => {
  const base = { email: 'ivanov@example.by', firstName: 'Иван', lastName: 'Иванов', birthDate: '1990-05-12' };

  it.each([['Str0ng!Pass'], ['Str0ng Pass1'], ['Str0ng_Pass1'], ['Passw0rd#xx'], ['Passw0rd£xx'], ['Passw0rd\\xxx']])(
    'should accept the ASCII symbol password %s',
    (password) => {
      expect(registerPatientSchema.safeParse({ ...base, password }).success).toBe(true);
    },
  );

  it.each([['Пароль1234Aa'], ['Passw0rd№№xx'], ['Passw0rd😀xx'], ['Passw0rd€€xx'], ['Passw0rdéééx']])(
    'should reject %s because a non-ASCII character is not a symbol for the server',
    (password) => {
      expect(registerPatientSchema.safeParse({ ...base, password }).success).toBe(false);
    },
  );

  it('should reject a password longer than the server maximum of 128 characters', () => {
    const password = `Aa1!${'x'.repeat(125)}`;

    expect(registerPatientSchema.safeParse({ ...base, password }).success).toBe(false);
    expect(registerPatientSchema.safeParse({ ...base, password: password.slice(0, 128) }).success).toBe(true);
  });

  it('should reject a birth date that is not a real calendar day', () => {
    expect(registerPatientSchema.safeParse({ ...base, password: 'Str0ng!Pass', birthDate: '1990-02-30' }).success).toBe(false);
    expect(registerPatientSchema.safeParse({ ...base, password: 'Str0ng!Pass', birthDate: '1990-13-01' }).success).toBe(false);
    expect(registerPatientSchema.safeParse({ ...base, password: 'Str0ng!Pass', birthDate: '2000-02-29' }).success).toBe(true);
  });

  it('should accept the optional gender values the server knows and refuse others', () => {
    expect(registerPatientSchema.safeParse({ ...base, password: 'Str0ng!Pass', gender: 'female' }).success).toBe(true);
    expect(registerPatientSchema.safeParse({ ...base, password: 'Str0ng!Pass', gender: 'other' }).success).toBe(false);
  });
});
