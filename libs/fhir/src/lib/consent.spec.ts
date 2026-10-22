import { CONSENT_CODE_SYSTEMS, MEDCENTER_EXT } from '@medcenter/terminology';

import {
  buildConsent,
  isConsentInForce,
  revokeConsent,
  toConsentResponse,
  type BuildConsentParams,
} from './consent';
import type { FhirResource } from './fhir-client.provider';

const NOW = new Date('2026-10-22T12:00:00Z');

const params: BuildConsentParams = {
  patientId: '1442',
  status: 'active',
  formNumber: 'ЭМК-2026-000123',
  signedAt: '2026-10-22',
  performerRef: 'Patient/1442',
  consenterType: 'self',
  signer: { name: 'Петрова А. А.' },
  scan: { binaryId: 'bin-1', contentType: 'application/pdf', hash: 'aGFzaA==' },
};

function consent(overrides: Record<string, unknown> = {}): FhirResource {
  return {
    ...buildConsent(params),
    id: 'c1',
    meta: { versionId: '1', lastUpdated: '2026-10-22T09:31:00Z' },
    ...overrides,
  };
}

describe('buildConsent', () => {
  it('should build a patient-privacy Consent of the emr-processing category with the policy rule text', () => {
    const resource = buildConsent(params);

    expect(resource).toMatchObject({
      resourceType: 'Consent',
      status: 'active',
      scope: { coding: [{ system: CONSENT_CODE_SYSTEMS.SCOPE, code: 'patient-privacy' }] },
      patient: { reference: 'Patient/1442' },
      dateTime: '2026-10-22',
      performer: [{ reference: 'Patient/1442' }],
      identifier: [{ system: CONSENT_CODE_SYSTEMS.FORM_NUMBER, value: 'ЭМК-2026-000123' }],
      policyRule: { text: expect.stringContaining('ст. 44 ч. 13') },
      provision: { type: 'permit', period: { start: '2026-10-22' } },
    });
    expect(JSON.stringify(resource['category'])).toContain('urn:medcenter:consent-category');
    expect(JSON.stringify(resource['category'])).toContain('emr-processing');
  });

  it('should attach the scan with its sha1 hash as Binary/{id}', () => {
    expect(buildConsent(params)['sourceAttachment']).toMatchObject({
      contentType: 'application/pdf',
      url: 'Binary/bin-1',
      hash: 'aGFzaA==',
    });
  });

  it('should write the signing practitioner as a note and never as an extension', () => {
    const resource = buildConsent(params);

    expect(resource['note']).toEqual([expect.objectContaining({ authorString: 'Петрова А. А.' })]);
    expect(JSON.stringify(resource['extension'])).not.toContain('signed');
  });

  it('should reference a PractitionerRole signer through authorReference', () => {
    const resource = buildConsent({
      ...params,
      signer: { reference: 'PractitionerRole/r1', name: 'Иванова' },
    });

    expect(resource['note']).toEqual([
      expect.objectContaining({ authorReference: { reference: 'PractitionerRole/r1' } }),
    ]);
  });

  it('should record a written refusal as rejected with a deny provision', () => {
    expect(buildConsent({ ...params, status: 'rejected' })).toMatchObject({
      status: 'rejected',
      provision: { type: 'deny' },
    });
  });

  it('should carry the consenter type and the representative document as extensions', () => {
    const resource = buildConsent({
      ...params,
      consenterType: 'guardian',
      performerRef: 'RelatedPerson/rp1',
      representativeDocument: 'Решение опеки № 5',
    });

    expect(resource['performer']).toEqual([{ reference: 'RelatedPerson/rp1' }]);
    expect(resource['extension']).toEqual(
      expect.arrayContaining([
        { url: MEDCENTER_EXT.CONSENT_CONSENTER_TYPE, valueCode: 'guardian' },
        { url: MEDCENTER_EXT.CONSENT_REPRESENTATIVE_DOCUMENT, valueString: 'Решение опеки № 5' },
      ]),
    );
  });
});

describe('revokeConsent', () => {
  it('should turn the Consent inactive and close its period without touching the rest', () => {
    const revoked = revokeConsent(consent(), {
      revokedAt: '2026-10-23T08:00:00Z',
      applicationNumber: 'ЗАЯВ-7',
    });

    expect(revoked).toMatchObject({
      id: 'c1',
      status: 'inactive',
      identifier: [{ value: 'ЭМК-2026-000123' }],
      provision: { type: 'permit', period: { start: '2026-10-22', end: '2026-10-23T08:00:00Z' } },
    });
    expect(revoked['extension']).toEqual(
      expect.arrayContaining([
        { url: MEDCENTER_EXT.CONSENT_REVOCATION_NUMBER, valueString: 'ЗАЯВ-7' },
      ]),
    );
  });

  it('should omit the revocation number when the patient revokes it themselves', () => {
    const revoked = revokeConsent(consent(), { revokedAt: '2026-10-23T08:00:00Z' });

    expect(JSON.stringify(revoked['extension'] ?? [])).not.toContain('revocation-number');
  });
});

describe('isConsentInForce', () => {
  it('should be true for an active consent of the patient whose period has started', () => {
    expect(isConsentInForce(consent(), '1442', NOW)).toBe(true);
  });

  it.each([
    ['inactive status', consent({ status: 'inactive' })],
    ['rejected status', consent({ status: 'rejected' })],
    ['another patient', consent({ patient: { reference: 'Patient/999' } })],
    [
      'another scope',
      consent({ scope: { coding: [{ system: CONSENT_CODE_SYSTEMS.SCOPE, code: 'treatment' }] } }),
    ],
    [
      'another category',
      consent({
        category: [{ coding: [{ system: CONSENT_CODE_SYSTEMS.CATEGORY, code: 'research' }] }],
      }),
    ],
    [
      'a period that ended',
      consent({
        provision: { type: 'permit', period: { start: '2026-01-01', end: '2026-10-21T10:00:00Z' } },
      }),
    ],
    [
      'a period that has not started',
      consent({ provision: { type: 'permit', period: { start: '2026-10-23' } } }),
    ],
    ['a deny provision', consent({ provision: { type: 'deny', period: { start: '2026-10-22' } } })],
    ['another resource type', { resourceType: 'Patient', id: '1' }],
  ])('should be false for %s', (_name, resource) => {
    expect(isConsentInForce(resource, '1442', NOW)).toBe(false);
  });

  it('should treat a date-only end as the end of that day', () => {
    const endsToday = consent({
      provision: { type: 'permit', period: { start: '2026-10-01', end: '2026-10-22' } },
    });
    const endedYesterday = consent({
      provision: { type: 'permit', period: { start: '2026-10-01', end: '2026-10-21' } },
    });

    expect(isConsentInForce(endsToday, '1442', NOW)).toBe(true);
    expect(isConsentInForce(endedYesterday, '1442', NOW)).toBe(false);
  });

  it('should accept an absolute patient reference', () => {
    expect(
      isConsentInForce(
        consent({ patient: { reference: 'http://hapi/fhir/Patient/1442' } }),
        '1442',
        NOW,
      ),
    ).toBe(true);
  });
});

describe('toConsentResponse', () => {
  it('should map a self-signed consent to the response contract', () => {
    expect(toConsentResponse(consent())).toEqual({
      id: 'c1',
      status: 'active',
      formNumber: 'ЭМК-2026-000123',
      signedAt: '2026-10-22',
      consenterType: 'self',
      performer: { type: 'Patient', id: '1442' },
      signedBy: 'Петрова А. А.',
      scan: { id: 'bin-1', contentType: 'application/pdf', hash: 'aGFzaA==' },
      period: { start: '2026-10-22' },
      recordedAt: '2026-10-22T09:31:00Z',
    });
  });

  it('should expose the representative, the revocation and the period end', () => {
    const revoked = revokeConsent(
      buildConsent({
        ...params,
        consenterType: 'relative',
        performerRef: 'RelatedPerson/rp1',
        representativeDocument: 'Паспорт',
      }),
      { revokedAt: '2026-10-23T08:00:00Z', applicationNumber: 'ЗАЯВ-7' },
    );

    expect(toConsentResponse({ ...revoked, id: 'c2' })).toMatchObject({
      status: 'inactive',
      consenterType: 'relative',
      performer: { type: 'RelatedPerson', id: 'rp1' },
      representativeDocument: 'Паспорт',
      revocationNumber: 'ЗАЯВ-7',
      period: { start: '2026-10-22', end: '2026-10-23T08:00:00Z' },
    });
  });

  it('should label a signer given by reference when no name was stored', () => {
    const resource = consent({
      note: [{ authorReference: { reference: 'PractitionerRole/r1' }, text: 'x' }],
    });

    expect(toConsentResponse(resource).signedBy).toBe('PractitionerRole/r1');
  });

  it('should survive a Consent without optional parts', () => {
    const bare: FhirResource = {
      resourceType: 'Consent',
      id: 'c3',
      status: 'active',
      patient: { reference: 'Patient/1442' },
      dateTime: '2026-10-22',
    };

    expect(toConsentResponse(bare)).toEqual({
      id: 'c3',
      status: 'active',
      signedAt: '2026-10-22',
      performer: { type: 'Patient', id: '1442' },
      period: {},
    });
  });
});
