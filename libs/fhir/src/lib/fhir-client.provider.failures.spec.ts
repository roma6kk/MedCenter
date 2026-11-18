import { DEFAULT_FHIR_TIMEOUT_MS, FhirClientError, HttpClient } from './fhir-client.provider';

const OUTCOME_BODY = '{"resourceType":"OperationOutcome"}';

async function rejectionOf(promise: Promise<unknown>): Promise<FhirClientError> {
  try {
    await promise;
  } catch (error) {
    return error as FhirClientError;
  }
  throw new Error('expected the request to reject');
}

function newClient(timeoutMs?: number): HttpClient {
  return new HttpClient({ baseUrl: 'http://hapi:8080/fhir', ...(timeoutMs === undefined ? {} : { timeoutMs }) });
}

function mockFetch(response: object): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue(response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function mockFetchRejecting(error: Error): void {
  global.fetch = jest.fn().mockRejectedValue(error) as unknown as typeof fetch;
}

function mockHttpError(status: number, text: string = OUTCOME_BODY): void {
  mockFetch({ ok: false, status, text: () => Promise.resolve(text) });
}

function timeoutError(): Error {
  const timeout = new Error('The operation was aborted due to timeout');
  timeout.name = 'TimeoutError';
  return timeout;
}

describe('HttpClient failures and timeouts', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should throw FhirClientError when HAPI answers a non-ok status', async () => {
    mockFetch({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('OperationOutcome: not found') });

    await expect(newClient().read('Slot', 'missing')).rejects.toBeInstanceOf(FhirClientError);
  });

  it('should carry the error body (OperationOutcome) on FhirClientError', async () => {
    mockFetch({ ok: false, status: 422, json: () => Promise.resolve({}), text: () => Promise.resolve(OUTCOME_BODY) });

    const error = await rejectionOf(newClient().read('Slot', 'broken'));

    expect(error).toBeInstanceOf(FhirClientError);
    expect(error.body).toBe(OUTCOME_BODY);
  });

  it('should keep the error message readable when the body cannot be read', async () => {
    mockFetch({ ok: false, status: 500, text: () => Promise.reject(new Error('socket closed')) });

    const error = await rejectionOf(newClient().read('Slot', 'x'));

    expect(error).toBeInstanceOf(FhirClientError);
    expect(error.upstreamStatus).toBe(500);
  });

  it('should surface a HAPI 404 as an API 404 NOT_FOUND', async () => {
    mockHttpError(404);

    const error = await rejectionOf(newClient().read('Location', 'missing'));

    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toMatchObject({ errorCode: 'NOT_FOUND' });
    expect(JSON.stringify(error.getResponse())).not.toContain('hapi:8080');
  });

  it('should surface a HAPI 5xx as 502 INTERNAL', async () => {
    mockHttpError(503, 'unavailable');

    const error = await rejectionOf(newClient().read('Slot', 'x'));

    expect(error.getStatus()).toBe(502);
    expect(error.getResponse()).toMatchObject({ errorCode: 'INTERNAL' });
    expect(error.upstreamStatus).toBe(503);
  });

  it('should surface a request timeout as 504 INTERNAL', async () => {
    mockFetchRejecting(timeoutError());

    const error = await rejectionOf(newClient().read('Slot', 'x'));

    expect(error).toBeInstanceOf(FhirClientError);
    expect(error.timedOut).toBe(true);
    expect(error.upstreamStatus).toBeUndefined();
    expect(error.getStatus()).toBe(504);
  });

  it('should surface a network failure as 502', async () => {
    mockFetchRejecting(new TypeError('fetch failed'));

    const error = await rejectionOf(newClient().read('Slot', 'x'));

    expect(error.timedOut).toBe(false);
    expect(error.getStatus()).toBe(502);
  });

  it.each([400, 422])('should surface a HAPI %i on our own write as 500 INTERNAL, not 502', async (upstreamStatus) => {
    mockHttpError(upstreamStatus);

    const error = await rejectionOf(newClient().update('Schedule', '1', { resourceType: 'Schedule', id: '1' }));

    expect(error.getStatus()).toBe(500);
    expect(error.getResponse()).toMatchObject({ errorCode: 'INTERNAL' });
    expect(error.upstreamStatus).toBe(upstreamStatus);
    expect(JSON.stringify(error.getResponse())).not.toContain('hapi:8080');
  });

  it.each([409, 412])('should surface a HAPI %i write conflict as 409 CONFLICT', async (upstreamStatus) => {
    mockHttpError(upstreamStatus);

    const error = await rejectionOf(newClient().update('Location', '1', { resourceType: 'Location', id: '1' }));

    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ errorCode: 'CONFLICT' });
    expect(error.upstreamStatus).toBe(upstreamStatus);
  });

  it('should surface a timeout while reading a successful body as 504', async () => {
    mockFetch({ ok: true, status: 200, json: () => Promise.reject(timeoutError()) });

    const error = await rejectionOf(newClient().search('Slot', { schedule: 'Schedule/1' }));

    expect(error).toBeInstanceOf(FhirClientError);
    expect(error.timedOut).toBe(true);
    expect(error.getStatus()).toBe(504);
    expect(error.getResponse()).toMatchObject({ errorCode: 'INTERNAL' });
  });

  it('should surface an unreadable successful body (not a timeout) as 502', async () => {
    mockFetch({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')) });

    const error = await rejectionOf(newClient().read('Slot', 'x'));

    expect(error.timedOut).toBe(false);
    expect(error.upstreamStatus).toBe(200);
    expect(error.getStatus()).toBe(502);
  });

  it('should pass an abort signal with the configured timeout to every request', async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, json: () => Promise.resolve({ resourceType: 'Slot' }) });

    await newClient(1234).read('Slot', 'slot-1');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect((init.signal as AbortSignal).aborted).toBe(false);
  });

  it('should default to the 10 s timeout when none is configured', async () => {
    mockFetch({ ok: true, status: 200, json: () => Promise.resolve({ resourceType: 'Slot' }) });

    await newClient().read('Slot', 'slot-1');

    expect(DEFAULT_FHIR_TIMEOUT_MS).toBe(10_000);
  });
});
