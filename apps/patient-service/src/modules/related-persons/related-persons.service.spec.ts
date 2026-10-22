import { FhirClientError, PatientReadAudit, type FhirClient, type FhirResource } from '@medcenter/fhir';

import {
  adminClaims,
  bundleOf,
  createFhirClientMock,
  doctorClaims,
  errorStatusOf,
  patientClaims,
  searchAnswering,
  sharedAppointment,
} from '../../__tests__/patient-service.fixtures';
import { PatientAccessService } from '../access/patient-access.service';
import { RelatedPersonsService } from './related-persons.service';

const mother: FhirResource = {
  resourceType: 'RelatedPerson',
  id: 'rp-1',
  active: true,
  patient: { reference: 'Patient/9f2c' },
  relationship: [
    {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'MTH', display: 'mother' }],
      text: 'Мать',
    },
  ],
  name: [{ family: 'Иванова', given: ['Мария', 'Петровна'] }],
  telecom: [{ system: 'phone', value: '+375291112233', use: 'mobile' }],
  gender: 'female',
};

const stranger: FhirResource = { ...mother, id: 'rp-9', patient: { reference: 'Patient/other' } };

const page = { page: 1, pageSize: 20 };

describe('RelatedPersonsService', () => {
  let fhir: jest.Mocked<FhirClient>;
  let service: RelatedPersonsService;

  beforeEach(() => {
    fhir = createFhirClientMock();
    fhir.search.mockResolvedValue(bundleOf(mother));
    service = new RelatedPersonsService(fhir, new PatientAccessService(fhir), new PatientReadAudit(fhir));
  });

  it('should return the related persons of the patient in a paginated envelope when access is allowed', async () => {
    // Act
    const result = await service.listForPatient('9f2c', adminClaims, page);

    // Assert
    expect(result).toEqual({
      items: [
        {
          id: 'rp-1',
          patientId: '9f2c',
          active: true,
          fullName: 'Иванова Мария Петровна',
          lastName: 'Иванова',
          firstName: 'Мария',
          middleName: 'Петровна',
          gender: 'female',
          relationship: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'MTH', display: 'Мать' }],
          telecom: [{ system: 'phone', value: '+375291112233', use: 'mobile' }],
        },
      ],
      meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
  });

  it('should search RelatedPerson by the patient reference with _offset paging when listing page 3', async () => {
    await service.listForPatient('9f2c', adminClaims, { page: 3, pageSize: 10 });

    expect(fhir.search).toHaveBeenCalledWith('RelatedPerson', {
      patient: 'Patient/9f2c',
      _count: 10,
      _offset: 20,
      _total: 'accurate',
      _sort: '_id',
    });
  });

  it('should read the Patient before searching when checking that the patient exists', async () => {
    await service.listForPatient('9f2c', adminClaims, page);

    expect(fhir.read).toHaveBeenCalledWith('Patient', '9f2c');
    expect(fhir.read.mock.invocationCallOrder[0]).toBeLessThan(fhir.search.mock.invocationCallOrder[0] ?? 0);
  });

  it('should compute totalPages from the HAPI total when the result spans several pages', async () => {
    fhir.search.mockResolvedValue({ total: 45, entry: [{ resource: mother }] });

    const result = await service.listForPatient('9f2c', adminClaims, page);

    expect(result.meta).toEqual({ page: 1, pageSize: 20, totalItems: 45, totalPages: 3 });
  });

  it('should derive totalItems from the page position when HAPI omits the total', async () => {
    fhir.search.mockResolvedValue({ entry: [{ resource: mother }] });

    const result = await service.listForPatient('9f2c', adminClaims, { page: 2, pageSize: 10 });

    expect(result.meta).toEqual({ page: 2, pageSize: 10, totalItems: 11, totalPages: 2 });
  });

  it('should return an empty page with zero totals when the patient has no related persons', async () => {
    fhir.search.mockResolvedValue({ total: 0 });

    const result = await service.listForPatient('9f2c', adminClaims, page);

    expect(result).toEqual({ items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
  });

  describe('defence in depth', () => {
    it('should drop a search entry that belongs to another patient when HAPI returns one', async () => {
      fhir.search.mockResolvedValue({ total: 2, entry: [{ resource: mother }, { resource: stranger }] });

      const result = await service.listForPatient('9f2c', adminClaims, page);

      expect(result.items.map((item) => item.id)).toEqual(['rp-1']);
    });

    it('should keep meta.totalItems consistent with items when a foreign entry is dropped', async () => {
      fhir.search.mockResolvedValue({ total: 2, entry: [{ resource: mother }, { resource: stranger }] });

      const result = await service.listForPatient('9f2c', adminClaims, page);

      expect(result.meta).toEqual({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
    });

    it('should skip an OperationOutcome entry without counting it as dropped when HAPI adds one', async () => {
      const outcome: FhirResource = { resourceType: 'OperationOutcome', issue: [{ severity: 'information' }] };
      fhir.search.mockResolvedValue({ total: 1, entry: [{ resource: mother }, { resource: outcome }] });

      const result = await service.listForPatient('9f2c', adminClaims, page);

      expect(result.items.map((item) => item.id)).toEqual(['rp-1']);
      expect(result.meta.totalItems).toBe(1);
    });
  });

  describe('access', () => {
    it('should list trusted persons when a patient reads their own compartment', async () => {
      const result = await service.listForPatient('9f2c', patientClaims, page);

      expect(result.items).toHaveLength(1);
    });

    it('should throw COMPARTMENT_VIOLATION without searching when a patient lists another patient', async () => {
      await expect(service.listForPatient('someone-else', patientClaims, page)).rejects.toThrow('COMPARTMENT_VIOLATION');
      expect(fhir.search).not.toHaveBeenCalled();
      expect(fhir.read).not.toHaveBeenCalled();
    });

    it('should list trusted persons when the doctor shares an appointment with the patient', async () => {
      fhir.search.mockImplementation(
        searchAnswering({ Appointment: bundleOf(sharedAppointment), RelatedPerson: bundleOf(mother) }),
      );

      const result = await service.listForPatient('9f2c', doctorClaims, page);

      expect(result.items.map((item) => item.id)).toEqual(['rp-1']);
    });

    it('should throw COMPARTMENT_VIOLATION without reading the patient when the doctor shares no care', async () => {
      fhir.search.mockImplementation(searchAnswering({ RelatedPerson: bundleOf(mother) }));

      await expect(service.listForPatient('9f2c', doctorClaims, page)).rejects.toThrow('COMPARTMENT_VIOLATION');
      expect(fhir.read).not.toHaveBeenCalled();
      expect(fhir.search).not.toHaveBeenCalledWith('RelatedPerson', expect.anything());
    });
  });

  describe('error mapping', () => {
    it('should propagate NOT_FOUND without searching when the patient does not exist', async () => {
      fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/Patient/nope', 404));

      await expect(service.listForPatient('nope', adminClaims, page)).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'NOT_FOUND' }),
      });
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when HAPI answers the patient read with another resource type', async () => {
      fhir.read.mockResolvedValue({ resourceType: 'OperationOutcome' });

      await expect(service.listForPatient('9f2c', adminClaims, page)).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'NOT_FOUND' }),
      });
    });

    it('should surface 502 when HAPI fails the RelatedPerson search', async () => {
      fhir.search.mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/RelatedPerson', 500));

      expect(await errorStatusOf(service.listForPatient('9f2c', adminClaims, page))).toBe(502);
    });
  });

  describe('read audit (ADR-018)', () => {
    const auditEvents = (): unknown[] => fhir.create.mock.calls.filter(([type]) => type === 'AuditEvent').map(([, event]) => event);

    it('should write a search-type AuditEvent when an administrator lists the trusted persons', async () => {
      await service.listForPatient('9f2c', adminClaims, page, 'req-1');

      expect(auditEvents()).toEqual([
        expect.objectContaining({ action: 'E', outcome: '0', subtype: [expect.objectContaining({ code: 'search-type' })] }),
      ]);
    });

    it('should write an AuditEvent with outcome 4 when the doctor shares no care', async () => {
      await expect(service.listForPatient('9f2c', doctorClaims, page, 'req-2')).rejects.toThrow('COMPARTMENT_VIOLATION');

      expect(auditEvents()).toEqual([expect.objectContaining({ outcome: '4' })]);
    });

    it('should write nothing when a patient lists their own trusted persons', async () => {
      await service.listForPatient('9f2c', patientClaims, page, 'req-3');

      expect(auditEvents()).toEqual([]);
    });
  });
});
