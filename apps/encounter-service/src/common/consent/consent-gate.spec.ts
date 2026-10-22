import { ConflictException } from '@nestjs/common';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { checkConsent } from './consent-gate';

function consent(period?: { start?: string; end?: string }): FhirResource {
  return {
    resourceType: 'Consent',
    id: 'c-1',
    status: 'active',
    scope: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' }] },
    category: [{ coding: [{ system: 'urn:medcenter:consent-category', code: 'emr-processing' }] }],
    patient: { reference: 'Patient/pat-1' },
    provision: { type: 'permit', ...(period === undefined ? {} : { period }) },
  };
}

function fhirWith(...consents: FhirResource[]): jest.Mocked<FhirClient> {
  return {
    search: jest.fn().mockResolvedValue({ total: consents.length, entry: consents.map((resource) => ({ resource })) }),
  } as unknown as jest.Mocked<FhirClient>;
}

describe('checkConsent', () => {
  it('should let the request through when an active consent exists', async () => {
    expect(await checkConsent(fhirWith(consent()), 'block', 'pat-1', undefined)).toEqual({ bypass: false });
  });

  it('should answer 409 CONSENT_REQUIRED in block mode without a consent', async () => {
    const error = await checkConsent(fhirWith(), 'block', 'pat-1', undefined).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ errorCode: 'CONSENT_REQUIRED' });
  });

  it('should treat a consent whose period has ended as missing', async () => {
    const expired = consent({ end: '2020-01-01' });

    await expect(checkConsent(fhirWith(expired), 'block', 'pat-1', undefined)).rejects.toBeInstanceOf(ConflictException);
  });

  it('should pass in warn mode without a consent', async () => {
    expect(await checkConsent(fhirWith(), 'warn', 'pat-1', undefined)).toEqual({ bypass: false });
  });

  it('should bypass the block with an emergency reason when there is no consent', async () => {
    expect(await checkConsent(fhirWith(), 'block', 'pat-1', 'patient unconscious, no representative')).toEqual({ bypass: true });
  });

  it('should not report a bypass when the consent exists although a reason was given', async () => {
    expect(await checkConsent(fhirWith(consent()), 'block', 'pat-1', 'patient unconscious, no representative')).toEqual({ bypass: false });
  });
});
