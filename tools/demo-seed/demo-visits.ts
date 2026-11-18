import type { AppointmentBookedEvent, EncounterCompletedEvent } from '@medcenter/contracts';
import { buildOutboxBasic } from '@medcenter/fhir';

import { buildBookedAppointment } from '../../apps/appointment-service/src/modules/appointments/appointment-resource';
import {
  carePlanResource,
  clinicalImpressionResource,
  conditionResource,
  medicationRequestResource,
  type ClinicalContext,
} from '../../apps/encounter-service/src/modules/encounters/mappers/clinical-resources.mapper';
import { displayKey } from '../../apps/encounter-service/src/modules/terminology/terminology-validator.service';
import { FHIR_BY } from '../../libs/terminology/src/lib/canonical-urls';
import { seedResourceId } from '../shared/deterministic-id';
import type { FhirHttp, FhirResource } from '../shared/fhir-http';
import { PATIENTS, SCHEDULES, type ScheduleDef } from './demo-catalog';
import { hasConsentInForce } from './demo-consents';
import { demoIds } from './demo-ids';
import { scheduleActors, serviceTypeConcept } from './demo-resources';
import { buildSlot, clinicDateOf } from './demo-slots';
import { serviceOf } from './demo-lookup';
import { addDays } from './seed-demo-fhir';

const PATIENT_KEY = 'patient.kuznetsov';
const DOCTOR_KEY = 'ivanova';
const SCHEDULE_KEY = 'ivanova-primary';
const SERVICE_KEY = 'ter-primary';

const PAST_VISIT_DAYS_AGO = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
// 09:00-09:30 clinic time (Europe/Minsk is UTC+3)
const PAST_VISIT_START = 'T06:00:00.000Z';
const PAST_VISIT_END = 'T06:30:00.000Z';

const AMBULATORY = { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' };
const ATTENDER = { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'ATND', display: 'attender' }] };

interface DemoVisitsSummary {
  readonly created: readonly string[];
  readonly kept: readonly string[];
}

interface WriteEntry {
  readonly method: 'PUT';
  readonly url: string;
  readonly resource: FhirResource;
  readonly ifMatch?: string;
}

const put = (resource: FhirResource, ifMatch?: string): WriteEntry => ({
  method: 'PUT',
  url: `${resource.resourceType}/${resource.id ?? ''}`,
  resource,
  ...(ifMatch === undefined ? {} : { ifMatch }),
});

function outboxEntry(event: AppointmentBookedEvent | EncounterCompletedEvent): WriteEntry {
  return put({ ...buildOutboxBasic(event), id: event.eventId });
}

function eventBase(key: string, occurredAt: string): { readonly v: 1; readonly eventId: string; readonly occurredAt: string } {
  return { v: 1, eventId: seedResourceId('OutboxEvent', key), occurredAt };
}

function bookable(slot: FhirResource) {
  return {
    slotId: slot.id ?? '',
    slot,
    practitionerRoleId: demoIds.practitionerRole(DOCTOR_KEY),
    practitionerId: demoIds.practitioner(DOCTOR_KEY),
    serviceId: demoIds.service(SERVICE_KEY),
  };
}

function bookedEventOf(key: string, appointment: FhirResource, slot: FhirResource, occurredAt: string, patientRef: string): AppointmentBookedEvent {
  return {
    ...eventBase(key, occurredAt),
    type: 'appointment.booked.v1',
    appointmentId: appointment.id ?? '',
    patientRef,
    practitionerRoleRef: `PractitionerRole/${demoIds.practitionerRole(DOCTOR_KEY)}`,
    slotRef: `Slot/${slot.id ?? ''}`,
    start: String(appointment['start']),
    serviceId: demoIds.service(SERVICE_KEY),
  };
}

function scheduleOf(): ScheduleDef {
  const schedule = SCHEDULES.find((candidate) => candidate.key === SCHEDULE_KEY);
  if (schedule === undefined) {
    throw new Error(`Unknown demo schedule "${SCHEDULE_KEY}"`);
  }
  return schedule;
}

function visitEncounter(appointment: FhirResource, context: ClinicalContext, interval: { start: string; end: string }): FhirResource {
  return {
    resourceType: 'Encounter',
    id: seedResourceId('Encounter', 'kuznetsov-visit'),
    status: 'finished',
    class: AMBULATORY,
    serviceType: serviceTypeConcept(serviceOf(SERVICE_KEY).typeCode),
    subject: { reference: context.patientRef },
    participant: [{ type: [ATTENDER], individual: { reference: context.practitionerRoleRef } }],
    appointment: [{ reference: `Appointment/${appointment.id ?? ''}` }],
    period: interval,
    diagnosis: [{ condition: { reference: `Condition/${seedResourceId('Condition', 'kuznetsov-visit')}` }, rank: 1 }],
  };
}

function clinicalEntries(context: ClinicalContext): WriteEntry[] {
  const conditionRef = `Condition/${seedResourceId('Condition', 'kuznetsov-visit')}`;
  const diagnosis = { code: 'J06.9', display: 'Острая инфекция верхних дыхательных путей неуточнённая', verificationStatus: 'confirmed' } as const;
  const dosage = { atcCode: 'N02BE01', dosageText: '500 мг при температуре выше 38,5 °C, не более 3 раз в сутки' };
  const summary = 'Жалобы на першение в горле и повышение температуры. Лёгкая форма ОРВИ.';
  const recommendations = 'Обильное питьё, постельный режим 3 дня. При ухудшении повторный приём.';
  const withId = (type: string, resource: FhirResource): WriteEntry => put({ ...resource, id: seedResourceId(type, 'kuznetsov-visit') });
  return [
    withId('Condition', conditionResource(context, diagnosis)),
    withId('ClinicalImpression', clinicalImpressionResource(context, summary, [conditionRef], [])),
    withId('CarePlan', carePlanResource(context, recommendations, [conditionRef])),
    withId('MedicationRequest', medicationRequestResource(context, dosage, conditionRef)),
  ];
}

function completedEventOf(context: ClinicalContext, occurredAt: string): EncounterCompletedEvent {
  return {
    ...eventBase('kuznetsov-visit-completed', occurredAt),
    type: 'encounter.completed.v1',
    encounterId: context.encounterRef.replace('Encounter/', ''),
    patientRef: context.patientRef,
    practitionerRef: context.practitionerRoleRef,
    diagnosisCount: 1,
  };
}

function pastVisitEntries(patientId: string, now: Date): WriteEntry[] {
  const patientRef = `Patient/${patientId}`;
  const roleRef = `PractitionerRole/${demoIds.practitionerRole(DOCTOR_KEY)}`;
  const day = addDays(clinicDateOf(now), -PAST_VISIT_DAYS_AGO);
  const interval = { start: `${day}${PAST_VISIT_START}`, end: `${day}${PAST_VISIT_END}` };
  const slot = { ...buildSlot(demoIds.schedule(SCHEDULE_KEY), interval, scheduleActors(scheduleOf())), status: 'busy' };
  const created = new Date(Date.parse(interval.start) - DAY_MS).toISOString();
  const appointment = { ...buildBookedAppointment(bookable(slot), patientRef), id: seedResourceId('Appointment', 'kuznetsov-visit'), status: 'fulfilled', created };
  const context: ClinicalContext = {
    encounterRef: `Encounter/${seedResourceId('Encounter', 'kuznetsov-visit')}`,
    patientRef,
    practitionerRoleRef: roleRef,
    now: interval.end,
    displays: new Map([[displayKey(FHIR_BY.ATC_CODE_SYSTEM, 'N02BE01'), 'Парацетамол']]),
  };
  return [
    put(slot),
    put(appointment),
    put(visitEncounter(appointment, context, interval)),
    ...clinicalEntries(context),
    outboxEntry(bookedEventOf('kuznetsov-visit-booked', appointment, slot, created, patientRef)),
    outboxEntry(completedEventOf(context, interval.end)),
  ];
}

function upcomingEntries(patientId: string, slot: FhirResource, now: Date): WriteEntry[] {
  const patientRef = `Patient/${patientId}`;
  const appointment = { ...buildBookedAppointment(bookable(slot), patientRef), id: seedResourceId('Appointment', 'kuznetsov-upcoming') };
  const versionId = (slot['meta'] as { versionId?: string } | undefined)?.versionId;
  return [
    put({ ...slot, status: 'busy' }, versionId === undefined ? undefined : `W/"${versionId}"`),
    put(appointment),
    outboxEntry(bookedEventOf('kuznetsov-upcoming-booked', appointment, slot, now.toISOString(), patientRef)),
  ];
}

async function exists(http: FhirHttp, type: string, id: string): Promise<boolean> {
  return (await http.search(type, { _id: id })).length > 0;
}

async function firstFreeSlot(http: FhirHttp, now: Date): Promise<FhirResource> {
  const found = await http.operation('Slot', {
    schedule: `Schedule/${demoIds.schedule(SCHEDULE_KEY)}`,
    status: 'free',
    start: `ge${addDays(clinicDateOf(now), 1)}`,
    _sort: 'start',
    _count: '1',
  });
  const slot = (found['entry'] as Array<{ resource?: FhirResource }> | undefined)?.[0]?.resource;
  if (slot === undefined) {
    throw new Error('No free slot of the primary therapist schedule: run "npm run seed:demo" first');
  }
  return slot;
}

export async function seedDemoVisits(http: FhirHttp, now: Date): Promise<DemoVisitsSummary> {
  const patient = PATIENTS.find((candidate) => candidate.emailLocal === PATIENT_KEY);
  const [found] = await http.search('Patient', { family: patient?.lastName ?? '', given: patient?.firstName ?? '', birthdate: patient?.birthDate ?? '' });
  if (found?.id === undefined) {
    throw new Error(`No Patient on the server for ${PATIENT_KEY}: run "npm run seed:demo -- --users" first`);
  }
  if (!(await hasConsentInForce(http, found.id, now))) {
    throw new Error(`${PATIENT_KEY} has no active consent: run "npm run seed:demo -- --consents" first`);
  }
  const created: string[] = [];
  const kept: string[] = [];
  const visit = 'past visit';
  if (await exists(http, 'Encounter', seedResourceId('Encounter', 'kuznetsov-visit'))) {
    kept.push(visit);
  } else {
    await http.bundle('transaction', pastVisitEntries(found.id, now));
    created.push(visit);
  }
  const upcoming = 'upcoming appointment';
  if (await exists(http, 'Appointment', seedResourceId('Appointment', 'kuznetsov-upcoming'))) {
    kept.push(upcoming);
  } else {
    await http.bundle('transaction', upcomingEntries(found.id, await firstFreeSlot(http, now), now));
    created.push(upcoming);
  }
  return { created, kept };
}
