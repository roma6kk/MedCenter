import { FhirClientError, type FhirClient } from '@medcenter/fhir';

import { AUTH_USER_IDENTIFIER_SYSTEM } from '../audit/audit-event.builder';
import { PatientProvisioner, applyDemographics, buildPatient } from './patient-provisioner';

function fakeFhir(): jest.Mocked<FhirClient> {
  return {
    search: jest.fn(),
    read: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    operation: jest.fn(),
    batch: jest.fn(),
  } as unknown as jest.Mocked<FhirClient>;
}

const DEMOGRAPHICS = {
  userId: 'user-1',
  email: 'ivanov@example.by',
  firstName: 'Иван',
  lastName: 'Иванов',
  birthDate: '1990-05-12',
} as const;

describe('buildPatient', () => {
  it('should build an R4 Patient with the official name, email and account identifier when gender is absent', () => {
    expect(buildPatient(DEMOGRAPHICS)).toEqual({
      resourceType: 'Patient',
      active: true,
      identifier: [{ system: AUTH_USER_IDENTIFIER_SYSTEM, value: 'user-1' }],
      name: [{ use: 'official', family: 'Иванов', given: ['Иван'] }],
      telecom: [{ system: 'email', value: 'ivanov@example.by', use: 'home' }],
      birthDate: '1990-05-12',
    });
  });

  it('should carry the administrative gender when it is given', () => {
    expect(buildPatient({ ...DEMOGRAPHICS, gender: 'female' })['gender']).toBe('female');
  });
});

describe('applyDemographics', () => {
  it('should change only the given fields and keep the rest of the Patient when an admin edits it', () => {
    const patient = {
      resourceType: 'Patient',
      id: 'pat-1',
      name: [{ use: 'official', family: 'Иванов', given: ['Иван'] }, { use: 'nickname', given: ['Ваня'] }],
      birthDate: '1990-05-12',
      address: [{ city: 'Минск' }],
    };

    const updated = applyDemographics(patient, { lastName: 'Петров', gender: 'male' });

    expect(updated).toEqual({
      resourceType: 'Patient',
      id: 'pat-1',
      name: [{ use: 'official', family: 'Петров', given: ['Иван'] }, { use: 'nickname', given: ['Ваня'] }],
      birthDate: '1990-05-12',
      address: [{ city: 'Минск' }],
      gender: 'male',
    });
  });
});

describe('applyDemographics (email)', () => {
  const patient = {
    resourceType: 'Patient',
    id: 'pat-1',
    telecom: [
      { system: 'phone', value: '+375291234567', use: 'mobile' },
      { system: 'email', value: 'old@example.by', use: 'home' },
      { system: 'email', value: 'work@example.by', use: 'work' },
    ],
  };

  it('should replace only the home email entry and keep the other contact points when the email changes', () => {
    const updated = applyDemographics(patient, { email: 'new@example.by' });

    expect(updated['telecom']).toEqual([
      { system: 'phone', value: '+375291234567', use: 'mobile' },
      { system: 'email', value: 'new@example.by', use: 'home' },
      { system: 'email', value: 'work@example.by', use: 'work' },
    ]);
  });

  it('should add a home email entry when the Patient has none', () => {
    const updated = applyDemographics({ resourceType: 'Patient', id: 'pat-2' }, { email: 'new@example.by' });

    expect(updated['telecom']).toEqual([{ system: 'email', value: 'new@example.by', use: 'home' }]);
  });

  it('should leave telecom untouched when the change carries no email', () => {
    expect(applyDemographics(patient, { lastName: 'Петров' })['telecom']).toEqual(patient.telecom);
  });
});

describe('PatientProvisioner', () => {
  it('should return the server-assigned id when HAPI creates the Patient', async () => {
    const fhir = fakeFhir();
    fhir.create.mockResolvedValue({ resourceType: 'Patient', id: 'pat-7' });

    await expect(new PatientProvisioner(fhir).create(DEMOGRAPHICS)).resolves.toBe('pat-7');
  });

  it('should fail with INTERNAL when HAPI answers without an id', async () => {
    const fhir = fakeFhir();
    fhir.create.mockResolvedValue({ resourceType: 'Patient' });

    await expect(new PatientProvisioner(fhir).create(DEMOGRAPHICS)).rejects.toMatchObject({ status: 500 });
  });

  describe('updateDemographics', () => {
    const stored = { resourceType: 'Patient', id: 'pat-1', meta: { versionId: '4' }, name: [] };

    it('should send the change in a transaction Bundle guarded by the version that was read', async () => {
      const fhir = fakeFhir();
      fhir.read.mockResolvedValue(stored);

      await new PatientProvisioner(fhir).updateDemographics('pat-1', { birthDate: '1991-01-01' });

      expect(fhir.update).not.toHaveBeenCalled();
      expect(fhir.batch).toHaveBeenCalledWith({
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [
          {
            resource: expect.objectContaining({ id: 'pat-1', birthDate: '1991-01-01' }),
            request: { method: 'PUT', url: 'Patient/pat-1', ifMatch: 'W/"4"' },
          },
        ],
      });
    });

    it('should surface the 409 when HAPI refuses the version because the Patient changed meanwhile', async () => {
      const fhir = fakeFhir();
      fhir.read.mockResolvedValue(stored);
      fhir.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi/', 412));

      await expect(new PatientProvisioner(fhir).updateDemographics('pat-1', { lastName: 'Петров' })).rejects.toMatchObject({
        status: 409,
      });
    });

    it('should fail with INTERNAL and write nothing when the read Patient carries no version', async () => {
      const fhir = fakeFhir();
      fhir.read.mockResolvedValue({ resourceType: 'Patient', id: 'pat-1' });

      await expect(new PatientProvisioner(fhir).updateDemographics('pat-1', { lastName: 'Петров' })).rejects.toMatchObject({
        status: 500,
      });
      expect(fhir.batch).not.toHaveBeenCalled();
    });
  });

  describe('removeCreatedFor', () => {
    it('should delete every Patient found under the account identifier', async () => {
      const fhir = fakeFhir();
      fhir.search.mockResolvedValue({
        entry: [{ resource: { resourceType: 'Patient', id: 'pat-1' } }, { resource: { resourceType: 'Patient', id: 'pat-2' } }],
      });

      await new PatientProvisioner(fhir).removeCreatedFor('user-1');

      expect(fhir.search).toHaveBeenCalledWith('Patient', {
        identifier: `${AUTH_USER_IDENTIFIER_SYSTEM}|user-1`,
        _elements: 'id',
      });
      expect(fhir.delete.mock.calls).toEqual([['Patient', 'pat-1'], ['Patient', 'pat-2']]);
    });

    it('should delete nothing when HAPI holds no Patient for the account', async () => {
      const fhir = fakeFhir();
      fhir.search.mockResolvedValue({});

      await new PatientProvisioner(fhir).removeCreatedFor('user-1');

      expect(fhir.delete).not.toHaveBeenCalled();
    });
  });
});
