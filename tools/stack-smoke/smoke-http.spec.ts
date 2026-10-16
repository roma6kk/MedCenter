import { ApiClient } from './smoke-http';
import type { Session } from './smoke-types';

const SESSION: Session = { email: 'a@x.test', role: 'PATIENT', accessToken: 'tok-123', grantedScope: 'launch', claims: {} };

function stubFetch(status: number, text: string, contentType = 'application/json'): jest.Mock {
  // A fresh Response per call: a body can be read once.
  const noBody = status === 204;
  const mock = jest.fn().mockImplementation(async () => new Response(noBody ? null : text, { status, headers: { 'content-type': contentType } }));
  jest.spyOn(global, 'fetch').mockImplementation(mock);
  return mock;
}

afterEach(() => jest.restoreAllMocks());

describe('ApiClient', () => {
  it('should send the bearer token and a JSON body, and parse the JSON answer', async () => {
    const fetchMock = stubFetch(201, '{"id":"1"}');
    const api = new ApiClient('http://edge');

    const answer = await api.post('/api/v1/appointments', { session: SESSION, body: { slotId: 's' }, headers: { 'Idempotency-Key': 'k' } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('http://edge/api/v1/appointments');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ authorization: 'Bearer tok-123', 'content-type': 'application/json', 'Idempotency-Key': 'k' });
    expect(init.body).toBe('{"slotId":"s"}');
    expect(answer).toMatchObject({ status: 201, body: { id: '1' } });
  });

  it('should add the query parameters it is given and skip the undefined ones', async () => {
    const fetchMock = stubFetch(200, '{}');

    await new ApiClient('http://edge').get('/api/v1/doctors', { query: { search: 'Иванова', page: 2, upcoming: true, none: undefined } });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`http://edge/api/v1/doctors?search=${encodeURIComponent('Иванова')}&page=2&upcoming=true`);
  });

  it('should send no authorization header for a public call and a raw one when asked', async () => {
    const fetchMock = stubFetch(200, '{}');
    const api = new ApiClient('http://edge');

    await api.get('/public');
    await api.get('/private', { authorization: 'Bearer forged' });

    const headersOf = (call: number): Record<string, string> => (fetchMock.mock.calls[call]?.[1] as { headers: Record<string, string> }).headers;
    expect(headersOf(0)).not.toHaveProperty('authorization');
    expect(headersOf(1)['authorization']).toBe('Bearer forged');
  });

  it('should leave the body undefined when the answer is empty or not JSON', async () => {
    stubFetch(204, '');
    const empty = await new ApiClient('http://edge').delete('/x');
    stubFetch(502, '<html>bad gateway</html>', 'text/html');
    const html = await new ApiClient('http://edge').get('/y');

    expect([empty.body, html.body]).toEqual([undefined, undefined]);
    expect(html.text).toContain('bad gateway');
  });

  it('should tell the response listener the method, path and status of every answer', async () => {
    stubFetch(404, '{}');
    const listener = jest.fn();

    await new ApiClient('http://edge', listener).get('/api/v1/doctors/9', { query: { x: 1 } });

    expect(listener).toHaveBeenCalledWith('GET', '/api/v1/doctors/9', 404);
  });

  it('should fail the call with the method and path when no answer arrives within the timeout', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(
      (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))),
    );

    const attempt = new ApiClient('http://edge', undefined, 20).get('/api/v1/doctors');

    await expect(attempt).rejects.toThrow('GET /api/v1/doctors got no answer within 20 ms');
  });

  it('should fail the call when the answer starts but its body read times out', async () => {
    const answerThatStalls = { status: 200, headers: new Headers(), text: () => Promise.reject(new DOMException('timed out', 'TimeoutError')) };
    jest.spyOn(global, 'fetch').mockResolvedValue(answerThatStalls as unknown as Response);

    const attempt = new ApiClient('http://edge', undefined, 20).get('/api/v1/slow');

    await expect(attempt).rejects.toThrow('GET /api/v1/slow got no answer within 20 ms');
  });

  it('should let a network error that is not a timeout through unchanged', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    await expect(new ApiClient('http://edge').get('/x')).rejects.toThrow('fetch failed');
  });

  it('should pass an abort signal to every request', async () => {
    const fetchMock = stubFetch(200, '{}');

    await new ApiClient('http://edge').get('/x');

    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });
});
