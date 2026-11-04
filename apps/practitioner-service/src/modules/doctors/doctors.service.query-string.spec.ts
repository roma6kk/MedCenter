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
      '/PractitionerRole?specialty=419192003&active%3Anot=false&_elements=practitioner&_count=1000',
    ],
    [
      'a specialty with its code system',
      { specialty: 'http://snomed.info/sct|394579002' },
      '/PractitionerRole?specialty=http%3A%2F%2Fsnomed.info%2Fsct%7C394579002&active%3Anot=false&_elements=practitioner&_count=1000',
    ],
    [
      'a service (its active schedules are asked first)',
      { serviceId: 'svc-1' },
      '/Schedule?actor=HealthcareService%2Fsvc-1&active%3Anot=false&_elements=actor&_count=1000',
    ],
    [
      'a service, a specialty and a name (the name is matched by the service, not sent)',
      { serviceId: 'svc-1', specialty: '419192003', search: 'Иванов' },
      '/Schedule?actor=HealthcareService%2Fsvc-1&active%3Anot=false&_elements=actor&_count=1000',
    ],
    ['no filter', {}, '/Practitioner?active%3Anot=false&_count=20&_offset=0&_total=accurate'],
    ['a name only (the first step of the scan the service matches it over)', { search: 'Iva' }, '/Practitioner?active%3Anot=false&_count=100&_offset=0'],
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
