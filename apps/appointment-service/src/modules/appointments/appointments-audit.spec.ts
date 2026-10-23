import type { JwtClaims } from '@medcenter/common';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { AppointmentsService } from './appointments.service';

const PATIENT: JwtClaims = { sub: 'user-1', scope: 'patient/*.write', role: 'PATIENT', patient: 'pat-1', jti: 'jti-1' };
const DOCTOR: JwtClaims = { sub: 'doc-1', scope: 'user/*.write', role: 'DOCTOR', fhirUser: 'PractitionerRole/role-1', jti: 'jti-2' };

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

const BOOKED: FhirResource = {
  resourceType: 'Appointment',
  id: 'apt-1',
  status: 'booked',
  slot: [{ reference: 'Slot/slot-1' }],
  participant: [{ actor: { reference: 'Patient/pat-1' } }, { actor: { reference: 'PractitionerRole/role-1' } }],
  meta: { versionId: '2' },
};

const COMMITTED = {
  resourceType: 'Bundle',
  type: 'transaction-response',
  entry: [{}, { response: { status: '201', location: 'Appointment/apt-9/_history/1' } }, {}],
};

/** The AuditEvent entry of the single transaction Bundle the service committed. */
function auditEventOf(fhir: jest.Mocked<FhirClient>): { entity: ReadonlyArray<Record<string, unknown>> } {
  const bundle = fhir.batch.mock.calls[0]?.[0] as unknown as { entry: Array<{ resource: FhirResource }> };
  const audit = bundle.entry.map((entry) => entry.resource).find((resource) => resource.resourceType === 'AuditEvent');
  return audit as unknown as { entity: ReadonlyArray<Record<string, unknown>> };
}

const REQUEST_ID_ENTITY = expect.objectContaining({ what: { identifier: { value: 'req-1' } } });
const PATIENT_ENTITY = expect.objectContaining({ what: { reference: 'Patient/pat-1' } });

describe('AppointmentsService audit trail (ADR-014, FR-021)', () => {
  let fhir: jest.Mocked<FhirClient>;
  let service: AppointmentsService;

  beforeEach(() => {
    fhir = {
      read: jest.fn(),
      search: jest.fn().mockResolvedValue({ entry: [] }),
      batch: jest.fn().mockResolvedValue(COMMITTED),
    } as unknown as jest.Mocked<FhirClient>;
    service = new AppointmentsService(fhir, 'warn');
  });

  it('should audit the booking with the patient and the request id when a patient books', async () => {
    // Arrange
    fhir.read.mockImplementation(async (type) => (type === 'Slot' ? FREE_SLOT : SCHEDULE));

    // Act
    await service.book(PATIENT, { slotId: 'slot-1' }, 'req-1');

    // Assert
    expect(auditEventOf(fhir).entity).toEqual(expect.arrayContaining([PATIENT_ENTITY, REQUEST_ID_ENTITY]));
  });

  it('should audit the cancellation with the patient and the request id when the owner cancels', async () => {
    // Arrange
    fhir.read.mockImplementation(async (type) => (type === 'Appointment' ? BOOKED : { ...FREE_SLOT, status: 'busy' }));

    // Act
    await service.cancel(PATIENT, 'apt-1', { reason: 'не смогу прийти' }, 'req-1');

    // Assert
    expect(auditEventOf(fhir).entity).toEqual(expect.arrayContaining([PATIENT_ENTITY, REQUEST_ID_ENTITY]));
  });

  it('should audit the no-show with the patient and the request id when the participant doctor marks it', async () => {
    // Arrange
    fhir.read.mockResolvedValue(BOOKED);

    // Act
    await service.markNoShow(DOCTOR, 'apt-1', 'req-1');

    // Assert
    expect(auditEventOf(fhir).entity).toEqual(expect.arrayContaining([PATIENT_ENTITY, REQUEST_ID_ENTITY]));
  });
});
