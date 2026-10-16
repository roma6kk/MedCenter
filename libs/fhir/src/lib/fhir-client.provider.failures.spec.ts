import { DEFAULT_FHIR_TIMEOUT_MS, FhirClientError, HttpClient } from './fhir-client.provider';

/** Awaits a promise that must reject and returns the FhirClientError. */
async function rejectionOf(promise: Promise<unknown>): Promise<FhirClientError> {
  try {
    await promise;
  } catch (error) {
    return error as FhirClientError;
  }
  throw new Error('expected the request to reject');
}

describe('HttpClient failures and timeouts', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
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
});
