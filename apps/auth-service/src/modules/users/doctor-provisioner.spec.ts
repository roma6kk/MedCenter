import { toDoctorResponseDto } from '@medcenter/fhir-mappers';
import { FhirClientError } from '@medcenter/fhir';

import { DoctorProvisioner } from './doctor-provisioner';
import { createFakeFhir } from './__tests__/users-harness';

const DOCTOR = { userId: 'user-1', firstName: 'Пётр', lastName: 'Петров', specialtyCode: '394579002' } as const;

describe('DoctorProvisioner', () => {
  it('should create a Practitioner and a PractitionerRole that the doctor catalog reads like a seeded doctor', async () => {
    const fhir = createFakeFhir();

    const ids = await new DoctorProvisioner(fhir).create(DOCTOR);

    expect(ids).toEqual({ practitionerId: 'practitioner-1', practitionerRoleId: 'practitionerrole-2' });
    const practitioner = fhir.create.mock.calls[0]?.[1];
    const role = fhir.create.mock.calls[1]?.[1];
    expect(toDoctorResponseDto({ ...practitioner, id: 'practitioner-1' } as never)).toMatchObject({
      firstName: 'Пётр',
      lastName: 'Петров',
      specialty: 'Кардиолог',
      specialtyCode: '394579002',
      specialtySystem: 'http://snomed.info/sct',
    });
    expect(role).toMatchObject({
      resourceType: 'PractitionerRole',
      active: true,
      practitioner: { reference: 'Practitioner/practitioner-1' },
      specialty: [{ coding: [{ code: '394579002' }] }],
    });
  });

  it('should refuse a specialty that is not in the clinic list with 400', async () => {
    const fhir = createFakeFhir();

    await expect(new DoctorProvisioner(fhir).create({ ...DOCTOR, specialtyCode: '1' })).rejects.toMatchObject({ status: 400 });
    expect(fhir.create).not.toHaveBeenCalled();
  });

  it('should delete the Practitioner again when the PractitionerRole cannot be created', async () => {
    const fhir = createFakeFhir();
    fhir.create.mockResolvedValueOnce({ resourceType: 'Practitioner', id: 'pr-1' });
    fhir.create.mockRejectedValueOnce(new FhirClientError('POST', 'http://hapi/', 500));

    await expect(new DoctorProvisioner(fhir).create(DOCTOR)).rejects.toBeInstanceOf(FhirClientError);

    expect(fhir.delete).toHaveBeenCalledWith('Practitioner', 'pr-1');
  });
});
