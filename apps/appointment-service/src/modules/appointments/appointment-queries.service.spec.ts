import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import type { FhirClient, FhirResource, FhirSearchResult } from '@medcenter/fhir';

import { AppointmentQueriesService } from './appointment-queries.service';

const NOW = new Date('2026-10-13T08:00:00.000Z');

const patient: JwtClaims = { sub: 'user-1', scope: 'patient/*.read', role: 'PATIENT', patient: '9f2c', jti: 'j-1' };
const doctor: JwtClaims = { sub: 'doc-1', scope: 'user/*.read', role: 'DOCTOR', fhirUser: 'PractitionerRole/role-1', jti: 'j-2' };
const admin: JwtClaims = { sub: 'adm-1', scope: 'user/*.read', role: 'ADMIN', jti: 'j-3' };

const appointment: FhirResource = {
  resourceType: 'Appointment',
  id: 'apt-1',
  status: 'booked',
  start: '2026-11-02T09:00:00+03:00',
  end: '2026-11-02T09:30:00+03:00',
  slot: [{ reference: 'Slot/slot-1' }],
  participant: [
    { actor: { reference: 'Patient/9f2c' } },
    { actor: { reference: 'PractitionerRole/role-1' } },
    { actor: { reference: 'HealthcareService/svc-1' } },
  ],
};

function bundleOf(resources: readonly FhirResource[], total?: number): FhirSearchResult {
  return { ...(total === undefined ? {} : { total }), entry: resources.map((resource) => ({ resource })) };
}

const withService = bundleOf(
  [appointment, { resourceType: 'HealthcareService', id: 'svc-1', name: 'Консультация терапевта' }],
  41,
);

/** `errorCode` carried by a rejected service call. */
async function errorCodeOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return ((error as { getResponse(): { errorCode?: unknown } }).getResponse()).errorCode;
  }
  throw new Error('expected the promise to reject');
}

describe('AppointmentQueriesService', () => {
  let service: AppointmentQueriesService;
  let fhir: jest.Mocked<FhirClient>;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    fhir = {
      search: jest.fn().mockResolvedValue(withService),
      read: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      operation: jest.fn(),
      batch: jest.fn(),
    } as unknown as jest.Mocked<FhirClient>;
    service = new AppointmentQueriesService(fhir);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('listForPatient', () => {
    it('should search the own compartment from the token, future only and sorted by start, when upcoming is set', async () => {
      // Arrange
      const query = { page: 3, pageSize: 20, sortOrder: 'asc' as const, upcoming: true };

      // Act
      await service.listForPatient(patient, query);

      // Assert
      expect(fhir.search).toHaveBeenCalledWith('Appointment', expect.objectContaining({
        patient: 'Patient/9f2c',
        date: [`ge${NOW.toISOString()}`],
        _sort: 'date',
        _count: 20,
        _offset: 40,
        _total: 'accurate',
        _include: 'Appointment:actor',
        '_include:iterate': 'PractitionerRole:practitioner',
      }));
    });

    it('should not restrict the date and should sort descending when upcoming is off and sortOrder is desc', async () => {
      // Arrange
      const query = { page: 1, pageSize: 20, sortOrder: 'desc' as const, upcoming: false };

      // Act
      await service.listForPatient(patient, query);

      // Assert
      const params = fhir.search.mock.calls[0]?.[1] ?? {};
      expect(params['date']).toBeUndefined();
      expect(params['_sort']).toBe('-date');
    });

    it('should wrap enriched items in the pagination envelope when HAPI reports a total', async () => {
      // Arrange
      const query = { page: 3, pageSize: 20, sortOrder: 'asc' as const, upcoming: true };

      // Act
      const page = await service.listForPatient(patient, query);

      // Assert
      expect(page.meta).toEqual({ page: 3, pageSize: 20, totalItems: 41, totalPages: 3 });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({ id: 'apt-1', serviceName: 'Консультация терапевта' });
    });

    it('should refuse before searching when the token carries no patient context', async () => {
      // Arrange
      const claims: JwtClaims = { ...patient, patient: undefined };

      // Act
      const promise = service.listForPatient(claims, { page: 1, pageSize: 20, sortOrder: 'asc', upcoming: false });

      // Assert
      await expect(promise).rejects.toBeInstanceOf(ForbiddenException);
      expect(fhir.search).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return the enriched appointment when the caller is the owner patient', async () => {
      // Arrange
      fhir.search.mockResolvedValue(withService);

      // Act
      const view = await service.findById(patient, 'apt-1');

      // Assert
      expect(fhir.search).toHaveBeenCalledWith('Appointment', expect.objectContaining({ _id: 'apt-1' }));
      expect(view).toMatchObject({ id: 'apt-1', serviceName: 'Консультация терапевта' });
    });

    it('should answer NOT_FOUND when no Appointment matches the id', async () => {
      // Arrange
      fhir.search.mockResolvedValue(bundleOf([]));

      // Act
      const promise = service.findById(patient, 'missing');

      // Assert
      await expect(promise).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should answer NOT_FOUND when the only match has a different id', async () => {
      // Arrange
      fhir.search.mockResolvedValue(bundleOf([{ ...appointment, id: 'apt-2' }]));

      // Act
      const code = await errorCodeOf(service.findById(admin, 'apt-1'));

      // Assert
      expect(code).toBe('NOT_FOUND');
    });

    it('should refuse with COMPARTMENT_VIOLATION when another patient asks', async () => {
      // Arrange
      const other: JwtClaims = { ...patient, patient: 'other' };

      // Act
      const code = await errorCodeOf(service.findById(other, 'apt-1'));

      // Assert
      expect(code).toBe('COMPARTMENT_VIOLATION');
    });

    it('should let the participant doctor and an admin read the appointment', async () => {
      // Arrange
      const callers = [doctor, admin];

      // Act
      const views = await Promise.all(callers.map((claims) => service.findById(claims, 'apt-1')));

      // Assert
      expect(views.map((view) => view.id)).toEqual(['apt-1', 'apt-1']);
    });

    it('should refuse with COMPARTMENT_VIOLATION when a non-participant doctor asks', async () => {
      // Arrange
      const other: JwtClaims = { ...doctor, fhirUser: 'PractitionerRole/role-9' };

      // Act
      const code = await errorCodeOf(service.findById(other, 'apt-1'));

      // Assert
      expect(code).toBe('COMPARTMENT_VIOLATION');
    });

    it('should fail closed before searching when a doctor token has no fhirUser', async () => {
      // Arrange
      const anonymousDoctor: JwtClaims = { ...doctor, fhirUser: undefined };

      // Act
      const code = await errorCodeOf(service.findById(anonymousDoctor, 'apt-1'));

      // Assert
      expect(code).toBe('COMPARTMENT_VIOLATION');
      expect(fhir.search).not.toHaveBeenCalled();
    });
  });

  describe('listForDoctor', () => {
    it('should search the appointments where the token PractitionerRole is an actor within the range', async () => {
      // Arrange
      const query = { page: 1, pageSize: 50, sortOrder: 'asc' as const, from: '2026-11-02', to: '2026-11-02' };

      // Act
      const page = await service.listForDoctor(doctor, query);

      // Assert
      expect(fhir.search).toHaveBeenCalledWith('Appointment', expect.objectContaining({
        actor: 'PractitionerRole/role-1',
        date: ['ge2026-11-02', 'le2026-11-02'],
        _sort: 'date',
        _count: 50,
        _offset: 0,
      }));
      expect(page.meta).toEqual({ page: 1, pageSize: 50, totalItems: 41, totalPages: 1 });
    });

    it('should not restrict the date when neither from nor to is given', async () => {
      // Arrange
      const query = { page: 1, pageSize: 20, sortOrder: 'asc' as const };

      // Act
      await service.listForDoctor(doctor, query);

      // Assert
      expect(fhir.search.mock.calls[0]?.[1]?.['date']).toBeUndefined();
    });

    it('should fail closed before searching when the doctor token has no PractitionerRole identity', async () => {
      // Arrange
      const anonymousDoctor: JwtClaims = { ...doctor, fhirUser: 'Patient/9f2c' };

      // Act
      const code = await errorCodeOf(service.listForDoctor(anonymousDoctor, { page: 1, pageSize: 20, sortOrder: 'asc' }));

      // Assert
      expect(code).toBe('COMPARTMENT_VIOLATION');
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should reject with VALIDATION_ERROR when from is after to', async () => {
      // Arrange
      const query = { page: 1, pageSize: 20, sortOrder: 'asc' as const, from: '2026-11-03', to: '2026-11-02' };

      // Act
      const promise = service.listForDoctor(doctor, query);

      // Assert
      await expect(promise).rejects.toBeInstanceOf(BadRequestException);
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should accept a date-time from within the day of a date-only to, which covers the whole day', async () => {
      // Arrange
      const query = { page: 1, pageSize: 20, sortOrder: 'asc' as const, from: '2026-11-02T10:00:00Z', to: '2026-11-02' };

      // Act
      await service.listForDoctor(doctor, query);

      // Assert
      expect(fhir.search).toHaveBeenCalledWith('Appointment', expect.objectContaining({ date: ['ge2026-11-02T10:00:00Z', 'le2026-11-02'] }));
    });

    it('should derive totalItems from the page when HAPI reports no total', async () => {
      // Arrange
      fhir.search.mockResolvedValue(bundleOf([appointment]));

      // Act
      const page = await service.listForDoctor(doctor, { page: 2, pageSize: 10, sortOrder: 'asc' });

      // Assert
      expect(page.meta).toEqual({ page: 2, pageSize: 10, totalItems: 11, totalPages: 2 });
    });
  });
});
