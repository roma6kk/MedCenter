import {
  DEFAULT_FHIR_TIMEOUT_MS,
  HttpClient,
  FhirClientError,
  createFhirClientProvider,
  FHIR_CLIENT,
} from './fhir-client.provider';

/** Awaits a promise that must reject and returns the FhirClientError. */
async function rejectionOf(promise: Promise<unknown>): Promise<FhirClientError> {
  try {
    await promise;
  } catch (error) {
    return error as FhirClientError;
  }
  throw new Error('expected the request to reject');
}

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

  it('should throw FhirClientError when HAPI answers a non-ok status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('OperationOutcome: not found'),
    }) as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });

    await expect(client.read('Slot', 'missing')).rejects.toBeInstanceOf(FhirClientError);
  });

  it('should carry the error body (OperationOutcome) on FhirClientError', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{"resourceType":"OperationOutcome"}'),
    }) as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });

    const error = await client.read('Slot', 'broken').catch((e: unknown) => e as FhirClientError);
    expect(error).toBeInstanceOf(FhirClientError);
    expect((error as FhirClientError).body).toBe('{"resourceType":"OperationOutcome"}');
  });

  it('should keep the error message readable when the body cannot be read', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error('socket closed')),
    }) as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });

    const error = await client.read('Slot', 'x').catch((e: unknown) => e as FhirClientError);
    expect(error).toBeInstanceOf(FhirClientError);
    expect((error as FhirClientError).upstreamStatus).toBe(500);
  });

  it('should surface a HAPI 404 as an API 404 NOT_FOUND', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('{"resourceType":"OperationOutcome"}'),
    }) as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });
    const error = await rejectionOf(client.read('Location', 'missing'));

    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toMatchObject({ errorCode: 'NOT_FOUND' });
    // The internal HAPI URL never reaches the client-facing payload.
    expect(JSON.stringify(error.getResponse())).not.toContain('hapi:8080');
  });

  it('should surface a HAPI 5xx as 502 INTERNAL', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('unavailable'),
    }) as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });
    const error = await rejectionOf(client.read('Slot', 'x'));

    expect(error.getStatus()).toBe(502);
    expect(error.getResponse()).toMatchObject({ errorCode: 'INTERNAL' });
    expect(error.upstreamStatus).toBe(503);
  });

  it('should surface a request timeout as 504 INTERNAL', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    global.fetch = jest.fn().mockRejectedValue(timeout) as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });
    const error = await rejectionOf(client.read('Slot', 'x'));

    expect(error).toBeInstanceOf(FhirClientError);
    expect(error.timedOut).toBe(true);
    expect(error.upstreamStatus).toBeUndefined();
    expect(error.getStatus()).toBe(504);
  });

  it('should surface a network failure as 502', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });
    const error = await rejectionOf(client.read('Slot', 'x'));

    expect(error.timedOut).toBe(false);
    expect(error.getStatus()).toBe(502);
  });

  it.each([400, 422])(
    'should surface a HAPI %i on our own write as 500 INTERNAL, not 502',
    async (upstreamStatus) => {
      // HAPI rejecting a resource we built is a defect in our mapping: neither
      // the client's input nor HAPI's availability is at fault.
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: upstreamStatus,
        text: () => Promise.resolve('{"resourceType":"OperationOutcome"}'),
      }) as unknown as typeof fetch;

      const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });
      const error = await rejectionOf(client.update('Schedule', '1', { resourceType: 'Schedule', id: '1' }));

      expect(error.getStatus()).toBe(500);
      expect(error.getResponse()).toMatchObject({ errorCode: 'INTERNAL' });
      expect(error.upstreamStatus).toBe(upstreamStatus);
      expect(JSON.stringify(error.getResponse())).not.toContain('hapi:8080');
    },
  );

  it.each([409, 412])(
    'should surface a HAPI %i write conflict as 409 CONFLICT',
    async (upstreamStatus) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: upstreamStatus,
        text: () => Promise.resolve('{"resourceType":"OperationOutcome"}'),
      }) as unknown as typeof fetch;

      const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });
      const error = await rejectionOf(client.update('Location', '1', { resourceType: 'Location', id: '1' }));

      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ errorCode: 'CONFLICT' });
      expect(error.upstreamStatus).toBe(upstreamStatus);
    },
  );

  it('should surface a timeout while reading a successful body as 504', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    // Headers arrived (200), then HAPI stalled on the Bundle body.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(timeout),
    }) as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });
    const error = await rejectionOf(client.search('Slot', { schedule: 'Schedule/1' }));

    expect(error).toBeInstanceOf(FhirClientError);
    expect(error.timedOut).toBe(true);
    expect(error.getStatus()).toBe(504);
    expect(error.getResponse()).toMatchObject({ errorCode: 'INTERNAL' });
  });

  it('should surface an unreadable successful body (not a timeout) as 502', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')),
    }) as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });
    const error = await rejectionOf(client.read('Slot', 'x'));

    expect(error.timedOut).toBe(false);
    expect(error.upstreamStatus).toBe(200);
    expect(error.getStatus()).toBe(502);
  });

  it('should pass an abort signal with the configured timeout to every request', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ resourceType: 'Slot' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir', timeoutMs: 1234 });
    await client.read('Slot', 'slot-1');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    // A fresh timeout signal of 1234 ms must not be already fired.
    expect((init.signal as AbortSignal).aborted).toBe(false);
  });

  it('should default to the 10 s timeout when none is configured', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ resourceType: 'Slot' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });
    await client.read('Slot', 'slot-1');

    expect(DEFAULT_FHIR_TIMEOUT_MS).toBe(10_000);
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
