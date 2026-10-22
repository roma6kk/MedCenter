import { ConflictException } from '@nestjs/common';

import { assertActiveConsent, findActiveConsent } from './active-consent';
import { buildConsent } from './consent';
import { FhirClientError, type FhirClient, type FhirResource } from './fhir-client.provider';

const NOW = new Date('2026-10-22T12:00:00Z');

function consent(id: string, overrides: Record<string, unknown> = {}): FhirResource {
  return {
    ...buildConsent({
      patientId: '1442',
      status: 'active',
      formNumber: 'F-1',
      signedAt: '2026-10-01',
      performerRef: 'Patient/1442',
      consenterType: 'self',
      signer: { name: 'Петрова' },
      scan: { binaryId: 'b1', contentType: 'application/pdf', hash: 'aA==' },
    }),
    id,
    ...overrides,
  };
}

function clientReturning(...resources: FhirResource[]): jest.Mocked<FhirClient> {
  return {
    search: jest
      .fn()
      .mockResolvedValue({
        total: resources.length,
        entry: resources.map((resource) => ({ resource })),
      }),
  } as unknown as jest.Mocked<FhirClient>;
}

async function rejection(promise: Promise<unknown>): Promise<ConflictException> {
  try {
    await promise;
  } catch (error) {
    return error as ConflictException;
  }
  throw new Error('expected a rejection');
}

describe('findActiveConsent', () => {
  it('should run the design 2.3 search for the patient, scope, category and active status', async () => {
    const fhir = clientReturning(consent('c1'));

    await findActiveConsent(fhir, '1442', NOW);

    expect(fhir.search).toHaveBeenCalledWith('Consent', {
      patient: 'Patient/1442',
      scope: 'patient-privacy',
      category: 'urn:medcenter:consent-category|emr-processing',
      status: 'active',
      _sort: '-date',
      _count: 10,
    });
  });

  it('should return the consent in force', async () => {
    expect(await findActiveConsent(clientReturning(consent('c1')), '1442', NOW)).toMatchObject({
      id: 'c1',
    });
  });

  it('should skip a consent whose period ended and return an older one in force', async () => {
    const expired = consent('c-old', {
      provision: { type: 'permit', period: { start: '2026-01-01', end: '2026-02-01' } },
    });

    expect(
      await findActiveConsent(clientReturning(expired, consent('c2')), '1442', NOW),
    ).toMatchObject({ id: 'c2' });
  });

  it('should not trust a search that ignored a parameter and returned another patient or status', async () => {
    const foreign = consent('c9', { patient: { reference: 'Patient/999' } });
    const inactive = consent('c8', { status: 'inactive' });

    expect(await findActiveConsent(clientReturning(foreign, inactive), '1442', NOW)).toBeNull();
  });

  it('should answer null when HAPI knows no such patient (404 on the reference search)', async () => {
    const fhir = {
      search: jest
        .fn()
        .mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/Consent', 404)),
    } as unknown as FhirClient;

    expect(await findActiveConsent(fhir, '1442', NOW)).toBeNull();
  });

  it('should let an upstream failure propagate', async () => {
    const fhir = {
      search: jest
        .fn()
        .mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/Consent', 503)),
    } as unknown as FhirClient;

    await expect(findActiveConsent(fhir, '1442', NOW)).rejects.toBeInstanceOf(FhirClientError);
  });

  it('should refuse an id that is not a FHIR id before searching', async () => {
    const fhir = clientReturning();

    await expect(findActiveConsent(fhir, '1442&status=x', NOW)).rejects.toThrow('FHIR id');
    expect(fhir.search).not.toHaveBeenCalled();
  });
});

describe('assertActiveConsent', () => {
  it('should return the active consent when one is in force', async () => {
    expect(await assertActiveConsent(clientReturning(consent('c1')), '1442', NOW)).toMatchObject({
      id: 'c1',
    });
  });

  it('should throw 409 CONSENT_REQUIRED when the patient has none', async () => {
    const error = await rejection(assertActiveConsent(clientReturning(), '1442', NOW));

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ errorCode: 'CONSENT_REQUIRED' });
  });

  it('should throw 409 CONSENT_REQUIRED when the only consent has expired', async () => {
    const expired = consent('c1', {
      provision: { type: 'permit', period: { start: '2026-01-01', end: '2026-02-01' } },
    });

    const error = await rejection(assertActiveConsent(clientReturning(expired), '1442', NOW));

    expect(error.getResponse()).toMatchObject({ errorCode: 'CONSENT_REQUIRED' });
  });
});
