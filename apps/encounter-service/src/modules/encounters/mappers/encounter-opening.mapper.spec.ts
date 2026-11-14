import { openedEncounterResource, type OpeningContext } from './encounter-opening.mapper';

const context: OpeningContext = {
  appointmentId: 'appt-1',
  appointment: {
    resourceType: 'Appointment',
    id: 'appt-1',
    status: 'booked',
    reasonCode: [{ text: 'free text of a legacy appointment' }],
  },
  patientRef: 'Patient/p1',
  practitionerRoleRef: 'PractitionerRole/pr1',
  actorSub: 'doctor-1',
  now: '2026-11-14T09:00:00.000Z',
  fullUrl: 'urn:uuid:enc-1',
};

describe('openedEncounterResource', () => {
  it('should open an in-progress ambulatory Encounter tied to the patient, the doctor and the Appointment', () => {
    expect(openedEncounterResource(context)).toMatchObject({
      resourceType: 'Encounter',
      status: 'in-progress',
      subject: { reference: 'Patient/p1' },
      appointment: [{ reference: 'Appointment/appt-1' }],
      period: { start: '2026-11-14T09:00:00.000Z' },
    });
  });

  it('should not copy the free-text reasonCode of a legacy Appointment into the Encounter', () => {
    expect(openedEncounterResource(context)).not.toHaveProperty('reasonCode');
  });
});
