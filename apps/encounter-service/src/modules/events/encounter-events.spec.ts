import { completedEvent } from './encounter-events';

describe('completedEvent', () => {
  const event = completedEvent({ encounterId: 'enc-1', patientRef: 'Patient/pat-1', practitionerRef: 'PractitionerRole/role-1', diagnosisCount: 2 });

  it('should build a versioned encounter.completed.v1 envelope with a fresh eventId', () => {
    expect(event).toEqual({
      v: 1,
      type: 'encounter.completed.v1',
      eventId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      occurredAt: expect.any(String),
      encounterId: 'enc-1',
      patientRef: 'Patient/pat-1',
      practitionerRef: 'PractitionerRole/role-1',
      diagnosisCount: 2,
    });
  });

  it('should give every event its own eventId', () => {
    const other = completedEvent({ encounterId: 'enc-1', patientRef: 'Patient/pat-1', practitionerRef: 'PractitionerRole/role-1', diagnosisCount: 2 });

    expect(other.eventId).not.toBe(event.eventId);
  });
});
