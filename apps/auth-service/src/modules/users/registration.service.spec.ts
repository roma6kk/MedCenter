import { ConflictException } from '@nestjs/common';
import { FhirClientError } from '@medcenter/fhir';

import type { RegisterPatientDto } from './dto/register-patient.dto';
import { createdOf, createUsersHarness, outboxEvent, outboxRecords } from './__tests__/users-harness';

function registrationDto(overrides: Partial<RegisterPatientDto> = {}): RegisterPatientDto {
  return {
    email: 'Ivanov@Example.by',
    firstName: 'Иван',
    lastName: 'Иванов',
    password: 'Str0ng!Pass',
    birthDate: '1990-05-12',
    accountConsent: { accepted: true, textVersion: '2026-10' },
    ...overrides,
  };
}

describe('RegistrationService', () => {
  it('should create a FHIR Patient and link it when a patient self-registers', async () => {
    const { registration, fhir } = createUsersHarness();

    const user = await registration.registerPatient(registrationDto(), 'req-1');

    expect(fhir.create).toHaveBeenCalledWith('Patient', expect.objectContaining({ resourceType: 'Patient' }));
    expect(user.patientRef).toMatch(/^Patient\//);
    expect(user).toMatchObject({ email: 'ivanov@example.by', roles: ['PATIENT'], isActive: true });
  });

  it('should store the phone on the Patient when the registration carries one', async () => {
    const { registration, fhir } = createUsersHarness();

    await registration.registerPatient(registrationDto({ phone: '+375291234567' }));

    expect(fhir.create).toHaveBeenCalledWith(
      'Patient',
      expect.objectContaining({
        telecom: [
          { system: 'email', value: 'ivanov@example.by', use: 'home' },
          { system: 'phone', value: '+375291234567', use: 'mobile' },
        ],
      }),
    );
  });

  it('should store no phone on the Patient when the registration has none', async () => {
    const { registration, fhir } = createUsersHarness();

    await registration.registerPatient(registrationDto());

    expect(fhir.create).toHaveBeenCalledWith(
      'Patient',
      expect.objectContaining({ telecom: [{ system: 'email', value: 'ivanov@example.by', use: 'home' }] }),
    );
  });

  it('should record when and under which text version the account consent was given', async () => {
    const { registration, store } = createUsersHarness();
    const before = Date.now();

    const user = await registration.registerPatient(registrationDto());

    const stored = await store.findById(user.id);
    expect(stored?.accountConsentVersion).toBe('2026-10');
    expect(stored?.accountConsentAt?.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('should not create a FHIR Consent when the account consent is recorded', async () => {
    const { registration, fhir } = createUsersHarness();

    await registration.registerPatient(registrationDto());

    expect(fhir.create).not.toHaveBeenCalledWith('Consent', expect.anything());
    expect(fhir.batch).not.toHaveBeenCalled();
  });

  it('should store a scrypt hash and never the plaintext when a patient registers', async () => {
    const { registration, store, hasher } = createUsersHarness();

    const user = await registration.registerPatient(registrationDto());

    const stored = await store.findById(user.id);
    expect(stored?.passwordHash.startsWith('scrypt$')).toBe(true);
    await expect(hasher.verify('Str0ng!Pass', stored?.passwordHash ?? '')).resolves.toBe(true);
  });

  it('should reject a duplicate email with EMAIL_TAKEN', async () => {
    const { registration } = createUsersHarness();
    await registration.registerPatient(registrationDto());

    const attempt = registration.registerPatient(registrationDto({ email: 'IVANOV@example.by' }));

    await expect(attempt).rejects.toThrow('EMAIL_TAKEN');
    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
  });

  it('should remove the user again when HAPI fails to create the Patient', async () => {
    const { registration, store, fhir } = createUsersHarness();
    fhir.create.mockRejectedValueOnce(new FhirClientError('POST', 'http://hapi/Patient', 503));

    await expect(registration.registerPatient(registrationDto())).rejects.toBeInstanceOf(FhirClientError);

    expect(store.users.size).toBe(0);
  });

  describe('when the Patient create ends without an answer', () => {
    const timedOut = (): FhirClientError =>
      new FhirClientError('POST', 'http://hapi/Patient', undefined, undefined, { timedOut: true });

    it('should delete the Patient HAPI stored under the account identifier when the create timed out', async () => {
      const { registration, store, fhir } = createUsersHarness();
      fhir.create.mockRejectedValueOnce(timedOut());
      fhir.search.mockResolvedValue({ entry: [{ resource: { resourceType: 'Patient', id: 'pat-orphan' } }] });

      await expect(registration.registerPatient(registrationDto())).rejects.toBeInstanceOf(FhirClientError);

      expect(fhir.search).toHaveBeenCalledWith(
        'Patient',
        expect.objectContaining({ identifier: expect.stringMatching(/^https:\/\/api\.medcenter\.by\/sid\/auth-user\|[0-9a-f-]{36}$/) }),
      );
      expect(fhir.delete).toHaveBeenCalledWith('Patient', 'pat-orphan');
      expect(store.users.size).toBe(0);
    });

    it('should not search for an orphan when HAPI answered with an error status', async () => {
      const { registration, fhir } = createUsersHarness();
      fhir.create.mockRejectedValueOnce(new FhirClientError('POST', 'http://hapi/Patient', 503));

      await expect(registration.registerPatient(registrationDto())).rejects.toBeInstanceOf(FhirClientError);

      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should still answer with the original failure when the orphan search fails too', async () => {
      const { registration, store, fhir } = createUsersHarness();
      fhir.create.mockRejectedValueOnce(timedOut());
      fhir.search.mockRejectedValue(timedOut());

      await expect(registration.registerPatient(registrationDto())).rejects.toMatchObject({ status: 504 });

      expect(store.users.size).toBe(0);
      expect(fhir.delete).not.toHaveBeenCalled();
    });
  });

  it('should record patient.registered.v1 with the bare Patient id in the outbox when registration succeeds', async () => {
    const { registration, fhir } = createUsersHarness();

    const user = await registration.registerPatient(registrationDto());

    const [record] = outboxRecords(fhir);
    expect(outboxRecords(fhir)).toHaveLength(1);
    expect(outboxEvent(record?.resource ?? {})).toMatchObject({
      type: 'patient.registered.v1',
      v: 1,
      patientId: user.patientRef?.replace('Patient/', ''),
    });
    expect(record?.resource).toMatchObject({ resourceType: 'Basic', id: record?.id, meta: { tag: [{ code: 'pending' }] } });
    expect(record?.id).toBe(outboxEvent(record?.resource ?? {})['eventId']);
  });

  it('should keep the email out of the outbox record', async () => {
    const { registration, fhir } = createUsersHarness();

    await registration.registerPatient(registrationDto());

    const [record] = outboxRecords(fhir);
    expect(outboxEvent(record?.resource ?? {})).not.toHaveProperty('email');
    expect(JSON.stringify(record?.resource).toLowerCase()).not.toContain('ivanov@example.by');
    expect(record?.resource).not.toHaveProperty('subject');
  });

  it('should write the outbox record after the Patient and before the AuditEvent', async () => {
    const { registration, fhir } = createUsersHarness();

    await registration.registerPatient(registrationDto());

    const order = [...fhir.create.mock.invocationCallOrder, ...fhir.update.mock.invocationCallOrder];
    const patient = fhir.create.mock.invocationCallOrder[fhir.create.mock.calls.findIndex(([type]) => type === 'Patient')] ?? 0;
    const audit = fhir.create.mock.invocationCallOrder[fhir.create.mock.calls.findIndex(([type]) => type === 'AuditEvent')] ?? 0;
    const outbox = fhir.update.mock.invocationCallOrder[0] ?? 0;
    expect(order).toHaveLength(3);
    expect(patient).toBeLessThan(outbox);
    expect(outbox).toBeLessThan(audit);
  });

  describe('when the outbox record cannot be written', () => {
    it('should remove the user and the Patient and rethrow when HAPI answers with an error status', async () => {
      const { registration, store, fhir } = createUsersHarness();
      fhir.update.mockRejectedValueOnce(new FhirClientError('PUT', 'http://hapi/Basic/x', 503));

      await expect(registration.registerPatient(registrationDto())).rejects.toBeInstanceOf(FhirClientError);

      expect(store.users.size).toBe(0);
      expect(fhir.delete).toHaveBeenCalledWith('Patient', 'patient-1');
      expect(fhir.delete).not.toHaveBeenCalledWith('Basic', expect.anything());
      expect(createdOf(fhir, 'AuditEvent')).toEqual([]);
    });

    it('should also delete the outbox record by its known id when the write ended without an answer', async () => {
      const { registration, store, fhir } = createUsersHarness();
      fhir.update.mockRejectedValueOnce(new FhirClientError('PUT', 'http://hapi/Basic/x', undefined, undefined, { timedOut: true }));

      await expect(registration.registerPatient(registrationDto())).rejects.toMatchObject({ status: 504 });

      const [attempt] = fhir.update.mock.calls;
      expect(store.users.size).toBe(0);
      expect(fhir.delete).toHaveBeenCalledWith('Patient', 'patient-1');
      expect(fhir.delete).toHaveBeenCalledWith('Basic', attempt?.[1]);
    });

    it('should accept a 404 from the outbox clean-up and still answer with the original failure', async () => {
      const { registration, store, fhir } = createUsersHarness();
      fhir.update.mockRejectedValueOnce(new FhirClientError('PUT', 'http://hapi/Basic/x', undefined, undefined, { timedOut: true }));
      fhir.delete.mockImplementation(async (type) => {
        if (type === 'Basic') {
          throw new FhirClientError('DELETE', 'http://hapi/Basic/x', 404);
        }
      });

      await expect(registration.registerPatient(registrationDto())).rejects.toMatchObject({ status: 504 });

      expect(store.users.size).toBe(0);
    });

    it('should still remove the user when removing the Patient fails as well', async () => {
      const { registration, store, fhir } = createUsersHarness();
      fhir.update.mockRejectedValueOnce(new FhirClientError('PUT', 'http://hapi/Basic/x', 503));
      fhir.delete.mockRejectedValue(new FhirClientError('DELETE', 'http://hapi/Patient/p', 503));

      await expect(registration.registerPatient(registrationDto())).rejects.toBeInstanceOf(FhirClientError);

      expect(store.users.size).toBe(0);
    });

    it('should let the same email register again afterwards', async () => {
      const { registration, store, fhir } = createUsersHarness();
      fhir.update.mockRejectedValueOnce(new FhirClientError('PUT', 'http://hapi/Basic/x', 503));
      await expect(registration.registerPatient(registrationDto())).rejects.toBeInstanceOf(FhirClientError);

      await expect(registration.registerPatient(registrationDto())).resolves.toMatchObject({ isActive: true });

      expect(store.users.size).toBe(1);
    });
  });

  it('should write an AuditEvent naming the new Patient when registration succeeds', async () => {
    const { registration, fhir } = createUsersHarness();

    const user = await registration.registerPatient(registrationDto(), 'req-9');

    const [audit] = createdOf(fhir, 'AuditEvent');
    expect(audit).toMatchObject({
      action: 'C',
      agent: [{ who: { identifier: { value: user.id } } }],
      entity: expect.arrayContaining([expect.objectContaining({ what: { reference: user.patientRef }, role: expect.objectContaining({ code: '1' }) })]),
    });
  });
});
