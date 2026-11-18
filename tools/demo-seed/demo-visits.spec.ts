import { toAppointmentResponseDto } from '@medcenter/fhir-mappers';

import type { Bundle, FhirHttp, FhirResource } from '../shared/fhir-http';
import { PATIENTS } from './demo-catalog';
import { planDemoConsent } from './demo-consents';
import { demoIds } from './demo-ids';
import { seedDemoVisits } from './demo-visits';

const NOW = new Date('2026-11-16T10:00:00.000Z');
const [kuznetsov] = PATIENTS as readonly [(typeof PATIENTS)[number]];
const PATIENT: FhirResource = { resourceType: 'Patient', id: 'p1', name: [{ family: kuznetsov.lastName }] };
const FREE_SLOT: FhirResource = {
  resourceType: 'Slot',
  id: 'slot-free',
  status: 'free',
  start: '2026-11-17T06:00:00.000Z',
  end: '2026-11-17T06:30:00.000Z',
  schedule: { reference: `Schedule/${demoIds.schedule('ivanova-primary')}` },
  meta: { versionId: '3' },
};

function fakeHttp(options: { consent?: boolean; stored?: FhirResource[] } = {}): { http: FhirHttp; written: FhirResource[] } {
  const written: FhirResource[] = [...(options.stored ?? [])];
  const consent = planDemoConsent(kuznetsov, 'p1', NOW).consent;
  const http = {
    search: async (type: string, params: Record<string, string>) => {
      if (type === 'Patient') return [PATIENT];
      if (type === 'Consent') return options.consent === false ? [] : [consent];
      return written.filter((resource) => resource.resourceType === type && resource.id === params['_id']);
    },
    operation: async () => ({ resourceType: 'Bundle', entry: [{ resource: FREE_SLOT }] }),
    bundle: async (_type: string, entries: ReadonlyArray<{ resource?: FhirResource }>): Promise<Bundle> => {
      written.push(...entries.flatMap((entry) => (entry.resource === undefined ? [] : [entry.resource])));
      return { resourceType: 'Bundle' };
    },
  } as unknown as FhirHttp;
  return { http, written };
}

const ofType = (written: readonly FhirResource[], type: string): FhirResource[] => written.filter((resource) => resource.resourceType === type);

describe('seedDemoVisits', () => {
  it('should write a finished visit with a diagnosis and a prescription that the history and prescription mappers read', async () => {
    const { http, written } = fakeHttp();

    const summary = await seedDemoVisits(http, NOW);

    expect(summary.created).toEqual(['past visit', 'upcoming appointment']);
    const [encounter] = ofType(written, 'Encounter');
    expect(encounter).toMatchObject({ status: 'finished', subject: { reference: 'Patient/p1' } });
    const [condition] = ofType(written, 'Condition');
    expect(condition).toMatchObject({ encounter: { reference: `Encounter/${encounter?.id}` }, code: { coding: [{ code: 'J06.9' }] } });
    expect(encounter?.['diagnosis']).toEqual([{ condition: { reference: `Condition/${condition?.id}` }, rank: 1 }]);
    const [medication] = ofType(written, 'MedicationRequest');
    expect(medication).toMatchObject({ subject: { reference: 'Patient/p1' }, encounter: { reference: `Encounter/${encounter?.id}` }, reasonReference: [{ reference: `Condition/${condition?.id}` }] });
    expect(ofType(written, 'ClinicalImpression')).toHaveLength(1);
    expect(ofType(written, 'CarePlan')).toHaveLength(1);
  });

  it('should mark the past appointment fulfilled and the finished encounter point at it, in the past', async () => {
    const { http, written } = fakeHttp();

    await seedDemoVisits(http, NOW);

    const past = ofType(written, 'Appointment').find((appointment) => appointment['status'] === 'fulfilled');
    const [encounter] = ofType(written, 'Encounter');
    expect(toAppointmentResponseDto(past as FhirResource)).toMatchObject({ patientId: 'p1', serviceId: demoIds.service('ter-primary'), practitionerRoleId: demoIds.practitionerRole('ivanova') });
    expect(encounter?.['appointment']).toEqual([{ reference: `Appointment/${past?.id}` }]);
    expect(Date.parse(String(past?.['end']))).toBeLessThan(NOW.getTime());
    expect(ofType(written, 'Slot').filter((slot) => slot['status'] === 'busy')).toHaveLength(2);
  });

  it('should book the first free slot of the primary therapist schedule and take it', async () => {
    const { http, written } = fakeHttp();

    await seedDemoVisits(http, NOW);

    const upcoming = ofType(written, 'Appointment').find((appointment) => appointment['status'] === 'booked');
    expect(upcoming).toMatchObject({ start: FREE_SLOT['start'], slot: [{ reference: 'Slot/slot-free' }] });
    expect(ofType(written, 'Slot').find((slot) => slot.id === 'slot-free')).toMatchObject({ status: 'busy' });
  });

  it('should queue the booking and completion events in the outbox so that analytics reads the visits', async () => {
    const { http, written } = fakeHttp();

    await seedDemoVisits(http, NOW);

    const types = ofType(written, 'Basic').map((basic) => JSON.parse(String((basic['extension'] as Array<{ valueString?: string }>)[2]?.valueString)).type);
    expect(types.sort()).toEqual(['appointment.booked.v1', 'appointment.booked.v1', 'encounter.completed.v1']);
  });

  it('should write nothing on a second run when both visits already exist', async () => {
    const first = fakeHttp();
    await seedDemoVisits(first.http, NOW);
    const second = fakeHttp({ stored: first.written });
    const before = second.written.length;

    const summary = await seedDemoVisits(second.http, NOW);

    expect(summary.created).toEqual([]);
    expect(summary.kept).toEqual(['past visit', 'upcoming appointment']);
    expect(second.written).toHaveLength(before);
  });

  it('should refuse to seed visits for a patient without the EMR consent, pointing at --consents', async () => {
    const { http, written } = fakeHttp({ consent: false });

    await expect(seedDemoVisits(http, NOW)).rejects.toThrow('--consents');
    expect(written).toEqual([]);
  });
});
