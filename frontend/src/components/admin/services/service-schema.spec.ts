import { EMPTY_SERVICE_VALUES, serviceSchema, serviceValuesOf, toServicePayload } from './service-schema';
import type { AdminService } from './service-types';

const service: AdminService = { id: 's1', name: 'Приём', typeSystem: 'https://fhir.by/CodeSystem/nsi-services', typeCode: '10001', defaultDurationMin: 30, isActive: true };

function failing(values: Partial<typeof EMPTY_SERVICE_VALUES>): ReadonlyArray<string> {
  const result = serviceSchema.safeParse({ ...EMPTY_SERVICE_VALUES, name: 'Приём', typeCode: '10001', ...values });
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('serviceSchema', () => {
  it('should accept the defaults when a name and a code are given', () => {
    expect(failing({})).toEqual([]);
  });

  it('should start from the НСИ services system and 30 minutes when the form is empty', () => {
    expect(EMPTY_SERVICE_VALUES).toMatchObject({ typeSystem: 'https://fhir.by/CodeSystem/nsi-services', defaultDurationMin: '30' });
  });

  it.each(['4', '241', '30.5', '', 'abc'])('should refuse the duration %j when the form is checked', (defaultDurationMin) => {
    expect(failing({ defaultDurationMin })).toContain('defaultDurationMin');
  });

  it.each(['5', '240'])('should accept the duration limit %s when the form is checked', (defaultDurationMin) => {
    expect(failing({ defaultDurationMin })).toEqual([]);
  });

  it('should require the name, the system and the code when they are empty', () => {
    expect(failing({ name: '', typeSystem: '', typeCode: ' ' })).toEqual(expect.arrayContaining(['name', 'typeSystem', 'typeCode']));
  });

  it('should refuse a description over 2000 characters and a name over 200 when the form is checked', () => {
    expect(failing({ description: 'x'.repeat(2001), name: 'y'.repeat(201) })).toEqual(expect.arrayContaining(['description', 'name']));
  });
});

describe('toServicePayload', () => {
  it('should leave the empty description out when a new service is built', () => {
    expect(toServicePayload({ ...serviceValuesOf(service), description: '' }, false)).toEqual({
      name: 'Приём',
      typeSystem: 'https://fhir.by/CodeSystem/nsi-services',
      typeCode: '10001',
      defaultDurationMin: 30,
    });
  });

  it('should send an empty description when a service is edited, so that it clears the old one', () => {
    expect(toServicePayload({ ...serviceValuesOf(service), description: '' }, true)).toMatchObject({ description: '' });
  });

  it('should not send the specialty codes the server would drop when the service is saved', () => {
    expect(toServicePayload(serviceValuesOf(service), false)).not.toHaveProperty('specialtyCodes');
  });
});
