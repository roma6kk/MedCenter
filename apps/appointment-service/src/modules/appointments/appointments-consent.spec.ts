import { ConflictException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { AppointmentsService } from './appointments.service';
import type { ConsentEnforcement } from './consent-enforcement';

const claims: JwtClaims = { sub: 'user-1', scope: 'patient/*.write', role: 'PATIENT', patient: '9f2c', jti: 'jti-1' };

const FREE_SLOT: FhirResource = {
  resourceType: 'Slot',
  id: 'slot-1',
  status: 'free',
  start: '2026-11-02T09:00:00+03:00',
  end: '2026-11-02T09:30:00+03:00',
  schedule: { reference: 'Schedule/sched-1' },
  meta: { versionId: '3' },
};
const SCHEDULE: FhirResource = {
  resourceType: 'Schedule',
  id: 'sched-1',
  actor: [{ reference: 'PractitionerRole/role-1' }, { reference: 'HealthcareService/svc-1' }],
};
const COMMITTED: FhirResource = {
  resourceType: 'Bundle',
  type: 'transaction-response',
  entry: [{}, { response: { status: '201', location: 'Appointment/apt-1/_history/1' } }, {}],
};
const CONSENT: FhirResource = {
  resourceType: 'Consent',
  id: 'c-1',
  status: 'active',
  scope: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' }] },
  category: [{ coding: [{ system: 'urn:medcenter:consent-category', code: 'emr-processing' }] }],
  patient: { reference: 'Patient/9f2c' },
  provision: { type: 'permit' },
};

describe('AppointmentsService.book without a patient consent (API §6.1, ADR-019)', () => {
  let fhir: jest.Mocked<FhirClient>;

  function serviceIn(mode: ConsentEnforcement, consents: FhirResource[] = []): AppointmentsService {
    fhir = {
      read: jest.fn().mockImplementation(async (type: string) => (type === 'Slot' ? FREE_SLOT : SCHEDULE)),
      search: jest.fn().mockResolvedValue({ total: consents.length, entry: consents.map((resource) => ({ resource })) }),
      batch: jest.fn().mockResolvedValue(COMMITTED),
    } as unknown as jest.Mocked<FhirClient>;
    return new AppointmentsService(fhir, mode);
  }

  const bookedReason = (): unknown => {
    const bundle = fhir.batch.mock.calls[0]?.[0] as unknown as { entry: Array<{ resource: FhirResource }> };
    return bundle.entry[1]?.resource['reasonCode'];
  };

  it('should book without a reason in block mode when the patient has no consent', async () => {
    await serviceIn('block').book(claims, { slotId: 'slot-1' });

    expect(fhir.batch).toHaveBeenCalledTimes(1);
    expect(fhir.search).not.toHaveBeenCalled();
  });

  it('should reject a free-text reason with 409 CONSENT_REQUIRED in block mode and write nothing', async () => {
    const error = await serviceIn('block').book(claims, { slotId: 'slot-1', reason: 'Болит спина' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ errorCode: 'CONSENT_REQUIRED' });
    expect(fhir.batch).not.toHaveBeenCalled();
  });

  it('should keep the reason in block mode when the patient has an active consent', async () => {
    await serviceIn('block', [CONSENT]).book(claims, { slotId: 'slot-1', reason: 'Болит спина' });

    expect(bookedReason()).toEqual([{ text: 'Болит спина' }]);
  });

  it('should book and strip the reason in warn mode when the patient has no consent', async () => {
    await serviceIn('warn').book(claims, { slotId: 'slot-1', reason: 'Болит спина' });

    expect(bookedReason()).toBeUndefined();
    expect(fhir.batch).toHaveBeenCalledTimes(1);
  });
});
