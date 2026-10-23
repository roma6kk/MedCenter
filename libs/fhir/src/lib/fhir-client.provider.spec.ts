import { HttpClient, FhirClientError, createFhirClientProvider, FHIR_CLIENT } from './fhir-client.provider';

describe('HttpClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should read a resource and return the FHIR envelope', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ resourceType: 'Slot', id: 'slot-1' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });
    const result = await client.read('Slot', 'slot-1');

    expect(result).toEqual({ resourceType: 'Slot', id: 'slot-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://hapi:8080/fhir/Slot/slot-1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('should invoke an instance-level operation via POST with a Parameters body', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ resourceType: 'Parameters' }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });
    await client.operation('Basic', '$expunge', { limit: 1, expungeDeletedResources: true }, { method: 'POST', id: 'b-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://hapi:8080/fhir/Basic/b-1/$expunge',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          resourceType: 'Parameters',
          parameter: [
            { name: 'limit', valueInteger: 1 },
            { name: 'expungeDeletedResources', valueBoolean: true },
          ],
        }),
      }),
    );
  });

  it('should invoke a type-level operation via GET with serialised params', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ resourceType: 'Parameters', parameter: [{ name: 'name', valueString: 'x' }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });
    const result = await client.operation('CodeSystem', '$lookup', {
      system: 'https://fhir.by/CodeSystem/nsi-services',
      code: '01',
      empty: '',
    });

    expect(result).toMatchObject({ resourceType: 'Parameters' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://hapi:8080/fhir/CodeSystem/$lookup?system=https%3A%2F%2Ffhir.by%2FCodeSystem%2Fnsi-services&code=01',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('should serialise search parameters into the query string', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ entry: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });
    await client.search('Slot', { schedule: 'Schedule/1', empty: '' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://hapi:8080/fhir/Slot?schedule=Schedule%2F1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('should send array values as repeated parameters (FHIR AND semantics)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ entry: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });
    await client.search('Slot', { start: ['ge2026-01-01', 'le2026-01-31'] });

    // A comma-joined `start=ge…,le…` would be an OR of the two prefixes.
    expect(fetchMock).toHaveBeenCalledWith(
      'http://hapi:8080/fhir/Slot?start=ge2026-01-01&start=le2026-01-31',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('should POST a batch Bundle to the FHIR base URL and return the response Bundle', async () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        { request: { method: 'PUT', url: 'Slot/abc' }, resource: { resourceType: 'Slot', id: 'abc' } },
      ],
    };
    const responseBundle = {
      resourceType: 'Bundle',
      type: 'batch-response',
      entry: [{ response: { status: '201 Created' } }],
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(responseBundle),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir/' });
    const result = await client.batch(bundle);

    expect(result).toEqual(responseBundle);
    // Batch is a POST to the bare base URL (trailing slash trimmed by request()).
    expect(fetchMock).toHaveBeenCalledWith(
      'http://hapi:8080/fhir/',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/fhir+json',
          Accept: 'application/fhir+json',
        }),
        body: JSON.stringify(bundle),
      }),
    );
  });

  it('should ask HAPI to bypass its search-result cache on searches and leave reads by id, operations and writes alone', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ resourceType: 'Bundle' }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });

    await client.search('Encounter', { appointment: 'Appointment/1' });
    await client.read('Encounter', '1');
    await client.operation('ValueSet', '$expand', { url: 'https://fhir.by/ValueSet/atc' });
    await client.create('Encounter', { resourceType: 'Encounter' });

    const cacheControlOf = (call: number): string | undefined => (fetchMock.mock.calls[call]?.[1] as { headers: Record<string, string> }).headers['Cache-Control'];
    expect([0, 1, 2, 3].map(cacheControlOf)).toEqual(['no-cache', undefined, undefined, undefined]);
  });

  it('should throw FhirClientError when the batch POST fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('server error'),
    }) as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });

    await expect(
      client.batch({ resourceType: 'Bundle', type: 'batch', entry: [] }),
    ).rejects.toBeInstanceOf(FhirClientError);
  });
});

describe('createFhirClientProvider', () => {
  it('should bind the FHIR client to the FHIR_CLIENT token', () => {
    const provider = createFhirClientProvider({
      FHIR_BASE_URL: 'http://hapi:8080/fhir',
    }) as { provide: unknown; useFactory: () => unknown };

    expect(provider.provide).toBe(FHIR_CLIENT);
    expect(typeof provider.useFactory()).toBe('object');
  });

  it('should fail fast when FHIR_BASE_URL is not configured', () => {
    const provider = createFhirClientProvider({}) as {
      provide: unknown;
      useFactory: () => unknown;
    };

    // A silent empty-baseUrl client would only surface on the first request;
    // misconfiguration must fail at startup instead.
    expect(() => provider.useFactory()).toThrow('FHIR_BASE_URL is not configured');
  });

  it('should fail fast on a non-numeric FHIR_TIMEOUT_MS', () => {
    const provider = createFhirClientProvider({
      FHIR_BASE_URL: 'http://hapi:8080/fhir',
      FHIR_TIMEOUT_MS: 'abc',
    }) as { useFactory: () => unknown };

    // Number('abc') is NaN and AbortSignal.timeout(NaN) throws on every request.
    expect(() => provider.useFactory()).toThrow('FHIR_TIMEOUT_MS must be a positive integer');
  });
});
