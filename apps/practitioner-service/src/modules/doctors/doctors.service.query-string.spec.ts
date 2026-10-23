import { HttpClient } from '@medcenter/fhir';

import { RoomsService } from '../rooms/rooms.service';
import { DoctorsService } from './doctors.service';

const BASE_URL = 'http://hapi:8080/fhir';

/** The exact URLs HAPI receives: the real `HttpClient` serializes the search params, `fetch` is a spy. */
describe('HAPI query strings', () => {
  let requestedUrls: string[];
  let doctorsService: DoctorsService;
  let roomsService: RoomsService;

  beforeEach(() => {
    requestedUrls = [];
    jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      requestedUrls.push(String(input));
      return Promise.resolve(new Response(JSON.stringify({ resourceType: 'Bundle', entry: [] }), { status: 200 }));
    });
    const client = new HttpClient({ baseUrl: BASE_URL });
    doctorsService = new DoctorsService(client);
    roomsService = new RoomsService(client);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    [
      'a specialty code',
      { specialty: '419192003' },
      '/PractitionerRole?specialty=419192003&_elements=practitioner&_count=1000',
    ],
    [
      'a specialty with its code system',
      { specialty: 'http://snomed.info/sct|394579002' },
      '/PractitionerRole?specialty=http%3A%2F%2Fsnomed.info%2Fsct%7C394579002&_elements=practitioner&_count=1000',
    ],
    [
      'a service',
      { serviceId: 'svc-1' },
      '/PractitionerRole?service=HealthcareService%2Fsvc-1&_elements=practitioner&_count=1000',
    ],
    [
      'a service, a specialty and a name',
      { serviceId: 'svc-1', specialty: '419192003', search: 'Иванов' },
      '/PractitionerRole?service=HealthcareService%2Fsvc-1&specialty=419192003&practitioner.name=%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2&_elements=practitioner&_count=1000',
    ],
    ['no filter', {}, '/Practitioner?_count=20&_offset=0&_total=accurate'],
    ['a name only', { search: 'Iva' }, '/Practitioner?name=Iva&_count=20&_offset=0&_total=accurate'],
  ])('should request the doctor list with %s', async (_label, filters, expectedPath) => {
    // Act
    await doctorsService.list(filters);

    // Assert
    expect(requestedUrls).toEqual([`${BASE_URL}${expectedPath}`]);
  });

  it('should request Location without a physical-type parameter when rooms are listed', async () => {
    // Act
    await roomsService.list();

    // Assert
    expect(requestedUrls).toEqual([`${BASE_URL}/Location?_count=100&_offset=0`]);
  });

  it('should never put a parameter R4 does not define on the wire when doctors and rooms are listed', async () => {
    // Act
    await doctorsService.list({ specialty: 'x', serviceId: 'svc-1', search: 'Va' });
    await doctorsService.list({ search: 'Va' });
    await roomsService.list();

    // Assert — HAPI answers these two with 400 HAPI-0524.
    const wire = requestedUrls.join('\n');
    expect(wire).not.toContain('qualification-code');
    expect(wire).not.toContain('physical-type');
  });
});
