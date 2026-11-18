import { createHash } from 'node:crypto';

import { buildConsent, isConsentInForce, toConsentResponse } from '@medcenter/fhir';

import type { FhirHttp, FhirResource } from '../shared/fhir-http';
import { DOCTORS, PATIENTS, type PatientDef } from './demo-catalog';
import {
  DEFAULT_PATIENT_WITHOUT_CONSENT,
  consentKeyOf,
  demoScanPdf,
  planDemoConsent,
  refreshDemoScans,
  scanHash,
  seedDemoConsents,
  selectConsentPatients,
} from './demo-consents';
import { demoIds } from './demo-ids';

const NOW = new Date('2026-11-02T10:00:00.000Z');
const [kuznetsov, lebedeva, novikov] = PATIENTS as readonly [PatientDef, PatientDef, PatientDef];

describe('demoScanPdf', () => {
  it('should be a PDF the service would accept: the %PDF- signature, small, different per patient', () => {
    const scan = demoScanPdf('kuznetsov');

    expect(scan.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(scan.length).toBeLessThan(100 * 1024);
    expect(demoScanPdf('lebedeva').equals(scan)).toBe(false);
    expect(demoScanPdf('kuznetsov').equals(scan)).toBe(true);
  });
});

describe('scanHash', () => {
  it('should be the base64 SHA-1 that 3.10 stores in Consent.sourceAttachment.hash', () => {
    const bytes = Buffer.from('abc');

    expect(scanHash(bytes)).toBe(createHash('sha1').update(bytes).digest('base64'));
  });
});

describe('consentKeyOf', () => {
  it('should drop the patient. prefix of the demo account', () => {
    expect(consentKeyOf(kuznetsov)).toBe('kuznetsov');
  });
});

describe('planDemoConsent', () => {
  const plan = planDemoConsent(kuznetsov, 'patient-1', NOW);

  it('should keep the scan as a deterministic Binary tied to the patient, so the scan read of 3.11 accepts it', () => {
    expect(plan.binary).toMatchObject({
      resourceType: 'Binary',
      contentType: 'application/pdf',
      securityContext: { reference: 'Patient/patient-1' },
    });
    expect(plan.binary.id).toBe(planDemoConsent(kuznetsov, 'patient-1', NOW).binary.id);
    expect(Buffer.from(String(plan.binary['data']), 'base64').subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('should build the Consent exactly as buildConsent does for 3.8 (same shape, ids, hash of the stored bytes)', () => {
    const bytes = Buffer.from(String(plan.binary['data']), 'base64');
    const expected = buildConsent({
      patientId: 'patient-1',
      status: 'active',
      formNumber: 'DEMO-kuznetsov',
      signedAt: String(plan.consent['dateTime']),
      performerRef: 'Patient/patient-1',
      consenterType: 'self',
      signer: {
        reference: `PractitionerRole/${demoIds.practitionerRole('ivanova')}`,
        name: `${DOCTORS[0]?.family} ${DOCTORS[0]?.given} ${DOCTORS[0]?.patronymic}`,
      },
      scan: { binaryId: plan.binary.id ?? '', contentType: 'application/pdf', hash: scanHash(bytes) },
    });

    const { id, ...consent } = plan.consent;
    const [expectedNote] = expected['note'] as Array<Record<string, unknown>>;
    const [note] = consent['note'] as Array<Record<string, unknown>>;
    expect(id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect({ ...consent, note: [{ ...note, time: '' }] }).toEqual({ ...expected, note: [{ ...expectedNote, time: '' }] });
  });

  it('should name the form DEMO-<key> and the demo signing doctor, and read back through the 3.7 mapper', () => {
    const response = toConsentResponse(plan.consent);

    expect(response).toMatchObject({
      status: 'active',
      formNumber: 'DEMO-kuznetsov',
      consenterType: 'self',
      performer: { type: 'Patient', id: 'patient-1' },
      signedBy: 'Иванова Мария Сергеевна',
      scan: { id: plan.binary.id, contentType: 'application/pdf' },
    });
  });

  it('should hold now: signed a day before the run, so a date-only start never lies in the future', () => {
    expect(isConsentInForce(plan.consent, 'patient-1', NOW)).toBe(true);
    expect(isConsentInForce(plan.consent, 'patient-1', new Date('2026-11-02T00:00:00.000Z'))).toBe(true);
  });

  it('should give every patient their own ids, and the same ones on every run', () => {
    const other = planDemoConsent(lebedeva, 'patient-2', NOW);

    expect(other.consent.id).not.toBe(plan.consent.id);
    expect(other.binary.id).not.toBe(plan.binary.id);
    expect(planDemoConsent(kuznetsov, 'patient-1', new Date('2027-01-01T00:00:00Z')).consent.id).toBe(plan.consent.id);
  });
});

describe('selectConsentPatients', () => {
  const registered = PATIENTS.map((patient) => `${patient.emailLocal}@medcenter.test`);

  it('should leave the default demo patient without consent on purpose', () => {
    expect(DEFAULT_PATIENT_WITHOUT_CONSENT).toBe('patient.novikov');
    const { withConsent, withoutConsent } = selectConsentPatients(PATIENTS, registered, DEFAULT_PATIENT_WITHOUT_CONSENT);

    expect(withConsent.map((patient) => patient.emailLocal)).toEqual([kuznetsov.emailLocal, lebedeva.emailLocal]);
    expect(withoutConsent.map((patient) => patient.emailLocal)).toEqual([novikov.emailLocal]);
  });

  it('should give everyone a consent when no patient is excluded', () => {
    const { withConsent, withoutConsent } = selectConsentPatients(PATIENTS, registered, undefined);

    expect(withConsent).toHaveLength(3);
    expect(withoutConsent).toEqual([]);
  });

  it('should only take the patients whose account is in the manifest', () => {
    const { withConsent } = selectConsentPatients(PATIENTS, [`${kuznetsov.emailLocal}@medcenter.test`], undefined);

    expect(withConsent.map((patient) => patient.emailLocal)).toEqual([kuznetsov.emailLocal]);
  });

  it('should refuse an excluded key that is not a demo patient, so a typo does not silently seed everyone', () => {
    expect(() => selectConsentPatients(PATIENTS, registered, 'patient.nobody')).toThrow(/patient\.nobody/);
  });
});

function fakeHttp(
  patients: ReadonlyArray<FhirResource>,
  existing: FhirResource[] = [],
): { http: FhirHttp; puts: FhirResource[]; ifMatches: Array<string | undefined>; expunged: string[] } {
  const puts: FhirResource[] = [];
  const ifMatches: Array<string | undefined> = [];
  const expunged: string[] = [];
  const consents = [...existing];
  const http = {
    search: async (type: string, params: Record<string, string>) => {
      if (type === 'Patient') {
        return patients.filter((patient) => (patient['name'] as Array<{ family: string }>)[0]?.family === params['family']);
      }
      if (type === 'Consent') {
        return consents.filter((consent) => (consent['patient'] as { reference: string }).reference === params['patient']);
      }
      throw new Error(`unexpected search ${type}`);
    },
    put: async (resource: FhirResource, options?: { ifMatch?: string }) => {
      puts.push(resource);
      ifMatches.push(options?.ifMatch);
      if (resource.resourceType === 'Consent') {
        consents.push(resource);
      }
      return resource;
    },
    expungePreviousVersions: async (type: string, id: string) => {
      expunged.push(`${type}/${id}`);
    },
  } as unknown as FhirHttp;
  return { http, puts, ifMatches, expunged };
}

const patientOf = (id: string, def: PatientDef): FhirResource => ({ resourceType: 'Patient', id, name: [{ family: def.lastName }] });

describe('seedDemoConsents', () => {
  const patients = [patientOf('p1', kuznetsov), patientOf('p2', lebedeva), patientOf('p3', novikov)];

  it('should write Binary before Consent for every patient but the excluded one', async () => {
    const { http, puts } = fakeHttp(patients);

    const summary = await seedDemoConsents(http, { withConsent: [kuznetsov, lebedeva], withoutConsent: [novikov], now: NOW });

    expect(puts.map((resource) => resource.resourceType)).toEqual(['Binary', 'Consent', 'Binary', 'Consent']);
    expect(summary).toEqual({
      created: [kuznetsov.emailLocal, lebedeva.emailLocal],
      alreadyActive: [],
      withoutConsent: [novikov.emailLocal],
      missing: [],
    });
  });

  it('should be idempotent: a patient with an active consent is skipped and nothing is written', async () => {
    const active = planDemoConsent(kuznetsov, 'p1', NOW).consent;
    const { http, puts } = fakeHttp(patients, [active]);

    const summary = await seedDemoConsents(http, { withConsent: [kuznetsov], withoutConsent: [], now: NOW });

    expect(puts).toEqual([]);
    expect(summary.alreadyActive).toEqual([kuznetsov.emailLocal]);
  });

  it('should seed again over a revoked consent, because only an active one counts', async () => {
    const revoked = { ...planDemoConsent(kuznetsov, 'p1', NOW).consent, status: 'inactive' };
    const { http, puts } = fakeHttp(patients, [revoked]);

    const summary = await seedDemoConsents(http, { withConsent: [kuznetsov], withoutConsent: [], now: NOW });

    expect(summary.created).toEqual([kuznetsov.emailLocal]);
    expect(puts).toHaveLength(2);
  });

  it('should report a patient that is not registered as missing and write nothing for them', async () => {
    const { http, puts } = fakeHttp([patientOf('p1', kuznetsov)]);

    const summary = await seedDemoConsents(http, { withConsent: [kuznetsov, lebedeva], withoutConsent: [], now: NOW });

    expect(summary.missing).toEqual([lebedeva.emailLocal]);
    expect(puts.filter((resource) => resource.resourceType === 'Consent')).toHaveLength(1);
  });

  it('should not touch the consent of the excluded patient even if they have none', async () => {
    const { http, puts } = fakeHttp(patients);

    await seedDemoConsents(http, { withConsent: [], withoutConsent: [novikov], now: NOW });

    expect(puts).toEqual([]);
  });
});

const scanHashOf = (consent: FhirResource | undefined): unknown => (consent?.['sourceAttachment'] as { hash?: string } | undefined)?.hash;

describe('refreshDemoScans', () => {
  const patients = [patientOf('p1', kuznetsov), patientOf('p2', lebedeva)];

  function withOldScan(def: PatientDef, patientId: string): FhirResource {
    const consent = planDemoConsent(def, patientId, NOW).consent;
    return { ...consent, sourceAttachment: { ...(consent['sourceAttachment'] as object), hash: 'old-scan-hash' } };
  }

  it('should replace the Binary and the hash of a demo consent that still points at the old scan', async () => {
    const stored = withOldScan(kuznetsov, 'p1');
    const { http, puts } = fakeHttp(patients, [stored]);

    const summary = await refreshDemoScans(http, { withConsent: [kuznetsov], now: NOW });

    const plan = planDemoConsent(kuznetsov, 'p1', NOW);
    expect(puts.map((resource) => resource.resourceType)).toEqual(['Binary', 'Consent']);
    expect(puts[0]).toEqual(plan.binary);
    expect(puts[1]).toEqual({ ...stored, sourceAttachment: plan.consent['sourceAttachment'] });
    expect(scanHashOf(puts[1])).toBe(scanHash(demoScanPdf('kuznetsov')));
    expect(summary).toEqual({ refreshed: [kuznetsov.emailLocal], unchanged: [], notDemoConsent: [], noConsent: [], missing: [] });
  });

  it('should PUT the Consent under If-Match of the stored version and expunge the previous versions of the replaced Binary', async () => {
    const stored = { ...withOldScan(kuznetsov, 'p1'), meta: { versionId: '3' } };
    const { http, puts, ifMatches, expunged } = fakeHttp(patients, [stored]);

    await refreshDemoScans(http, { withConsent: [kuznetsov], now: NOW });

    expect(ifMatches[puts.findIndex((resource) => resource.resourceType === 'Consent')]).toBe('W/"3"');
    expect(expunged).toEqual([`Binary/${planDemoConsent(kuznetsov, 'p1', NOW).binary.id}`]);
  });

  it('should expunge nothing when the scan is already the watermarked one', async () => {
    const { http, expunged } = fakeHttp(patients, [planDemoConsent(kuznetsov, 'p1', NOW).consent]);

    await refreshDemoScans(http, { withConsent: [kuznetsov], now: NOW });

    expect(expunged).toEqual([]);
  });

  it('should be idempotent: a consent that already carries the watermarked scan hash is left alone', async () => {
    const { http, puts } = fakeHttp(patients, [planDemoConsent(kuznetsov, 'p1', NOW).consent]);

    const summary = await refreshDemoScans(http, { withConsent: [kuznetsov], now: NOW });

    expect(puts).toEqual([]);
    expect(summary.unchanged).toEqual([kuznetsov.emailLocal]);
  });

  it('should keep the other fields of the stored consent when it rewrites the attachment', async () => {
    const stored = { ...withOldScan(kuznetsov, 'p1'), note: [{ text: 'kept' }] };
    const { http, puts } = fakeHttp(patients, [stored]);

    await refreshDemoScans(http, { withConsent: [kuznetsov], now: NOW });

    expect(puts[1]?.['note']).toEqual([{ text: 'kept' }]);
  });

  it('should not touch an active consent that is not the demo one', async () => {
    const own = { ...withOldScan(kuznetsov, 'p1'), id: 'consent-made-in-the-ui' };
    const { http, puts } = fakeHttp(patients, [own]);

    const summary = await refreshDemoScans(http, { withConsent: [kuznetsov], now: NOW });

    expect(puts).toEqual([]);
    expect(summary.notDemoConsent).toEqual([kuznetsov.emailLocal]);
  });

  it('should skip a patient without an active consent and report one that is not registered', async () => {
    const { http, puts } = fakeHttp([patientOf('p1', kuznetsov)]);

    const summary = await refreshDemoScans(http, { withConsent: [kuznetsov, lebedeva], now: NOW });

    expect(puts).toEqual([]);
    expect(summary.noConsent).toEqual([kuznetsov.emailLocal]);
    expect(summary.missing).toEqual([lebedeva.emailLocal]);
  });
});
