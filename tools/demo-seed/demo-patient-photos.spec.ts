import type { FhirHttp, FhirResource } from '../shared/fhir-http';
import { PATIENTS, patientPhotoUrl } from './demo-catalog';
import { attachPatientPhotos } from './demo-patient-photos';

const [first, second] = PATIENTS;

function fakeHttp(store: Map<string, FhirResource>): { http: FhirHttp; puts: FhirResource[] } {
  const puts: FhirResource[] = [];
  const http = {
    search: async (_type: string, params: Record<string, string>) =>
      [...store.values()].filter((p) => (p['name'] as Array<{ family: string }>)[0]?.family === params['family']),
    put: async (resource: FhirResource) => {
      puts.push(resource);
      store.set(resource.id ?? '', resource);
      return resource;
    },
  } as unknown as FhirHttp;
  return { http, puts };
}

const patientOf = (id: string, family: string): FhirResource => ({ resourceType: 'Patient', id, name: [{ family }], active: true });

describe('attachPatientPhotos', () => {
  it('writes photo[0] on the registered patient, keeps the rest, and reports unregistered ones as missing', async () => {
    const store = new Map([['p1', patientOf('p1', first.lastName)]]);
    const { http, puts } = fakeHttp(store);
    const summary = await attachPatientPhotos(http, [first, second]);
    expect(summary).toEqual({ updated: [first.emailLocal], unchanged: [], missing: [second.emailLocal] });
    expect(puts[0]).toMatchObject({ id: 'p1', active: true, photo: [{ contentType: 'image/jpeg', url: patientPhotoUrl(first) }] });
  });

  it('is idempotent: a second run writes nothing', async () => {
    const store = new Map([['p1', patientOf('p1', first.lastName)]]);
    const { http, puts } = fakeHttp(store);
    await attachPatientPhotos(http, [first]);
    puts.length = 0;
    expect(await attachPatientPhotos(http, [first])).toEqual({ updated: [], unchanged: [first.emailLocal], missing: [] });
    expect(puts).toHaveLength(0);
  });
});
